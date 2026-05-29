import mysql from 'mysql2/promise'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

let pool = null
let mysqlReady = false

function mysqlConfig() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_DATABASE) return null

  return {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true
  }
}

export async function getPool() {
  if (pool) return pool

  const options = mysqlConfig()
  if (!options) return null

  try {
    pool = mysql.createPool(options)
    mysqlReady = true
    return pool
  } catch (error) {
    console.error(`创建 MySQL 连接池失败: ${error.message}`)
    pool = null
    mysqlReady = false
    return null
  }
}

export function isMysqlReady() {
  return mysqlReady && pool !== null
}

export async function execute(sql, params) {
  const p = await getPool()
  if (!p) throw new Error('MySQL 连接未就绪')
  return p.execute(sql, params)
}

export async function query(sql, params) {
  const p = await getPool()
  if (!p) throw new Error('MySQL 连接未就绪')
  return p.query(sql, params)
}

export async function initDatabase() {
  const p = await getPool()
  if (!p) {
    console.log('MySQL 未配置或无法连接，系统将退回本地 JSON 文件存储模式。')
    return
  }

  try {
    console.log('开始初始化 MySQL 数据库表结构...')

    // 1. 创建用户表
    await p.execute(`
      CREATE TABLE IF NOT EXISTS my_read_users (
        \`id\` VARCHAR(32) PRIMARY KEY,
        \`account\` VARCHAR(128) NOT NULL UNIQUE,
        \`nickname\` VARCHAR(128) NOT NULL,
        \`avatar_text\` VARCHAR(16) NOT NULL,
        \`avatar_url\` TEXT NULL,
        \`email\` VARCHAR(255) NULL,
        \`salt\` VARCHAR(64) NOT NULL,
        \`password_hash\` VARCHAR(128) NOT NULL,
        \`created_at\` DATETIME NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    // 检查并添加用户表的额外列
    for (const statement of [
      'ALTER TABLE my_read_users ADD COLUMN avatar_url TEXT NULL',
      'ALTER TABLE my_read_users ADD COLUMN email VARCHAR(255) NULL'
    ]) {
      try {
        await p.execute(statement)
      } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME' && !String(error.message || '').includes('Duplicate column name')) {
          console.warn(`更新用户表列失败: ${error.message}`)
        }
      }
    }

    // 2. 创建版本表
    await p.execute(`
      CREATE TABLE IF NOT EXISTS my_read_app_versions (
        \`id\` VARCHAR(32) PRIMARY KEY,
        \`version_name\` VARCHAR(64) NOT NULL,
        \`version_code\` INT NOT NULL UNIQUE,
        \`release_notes\` TEXT NOT NULL,
        \`apk_url\` TEXT NOT NULL,
        \`is_force_update\` TINYINT(1) DEFAULT 0,
        \`created_at\` DATETIME NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    // 3. 创建播放记录表 (使用反单引号规避 current_time 保留字语法问题)
    await p.execute(`
      CREATE TABLE IF NOT EXISTS my_read_playback_records (
        \`owner_id\` VARCHAR(128) NOT NULL,
        \`book_id\` VARCHAR(128) NOT NULL,
        \`book_title\` VARCHAR(256) NOT NULL,
        \`chapter_id\` VARCHAR(256) NOT NULL,
        \`chapter_name\` VARCHAR(256) NOT NULL,
        \`chapter_index\` INT DEFAULT 0,
        \`chapter_count\` INT DEFAULT 0,
        \`current_time\` DOUBLE DEFAULT 0,
        \`duration\` DOUBLE DEFAULT 0,
        \`updated_at\` BIGINT NOT NULL,
        PRIMARY KEY (\`owner_id\`, \`book_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    // 4. 创建订阅源表 (全局统一管理，所有用户可见)
    await p.execute(`
      CREATE TABLE IF NOT EXISTS my_read_subscription_sources (
        \`id\` VARCHAR(32) PRIMARY KEY,
        \`name\` VARCHAR(128) NOT NULL,
        \`url\` VARCHAR(512) NOT NULL,
        \`created_at\` DATETIME NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    // 5. 创建订阅收藏书籍表 (按用户隔离)
    await p.execute(`
      CREATE TABLE IF NOT EXISTS my_read_subscribed_books (
        \`user_id\` VARCHAR(32) NOT NULL,
        \`id\` VARCHAR(128) NOT NULL,
        \`title\` VARCHAR(256) NOT NULL,
        \`source_name\` VARCHAR(128) NOT NULL,
        \`source_id\` VARCHAR(128) NOT NULL,
        \`audio_url\` VARCHAR(512) DEFAULT '',
        \`author\` VARCHAR(128) DEFAULT '',
        \`chapters_json\` LONGTEXT NULL,
        \`created_at\` DATETIME NOT NULL,
        PRIMARY KEY (\`user_id\`, \`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    console.log('MySQL 数据库表结构初始化成功！')

    // 执行数据热迁移
    await runMigrations(p)

  } catch (error) {
    console.error(`初始化 MySQL 表结构失败: ${error.message}。系统将退回本地 JSON 存储。`)
    pool = null
    mysqlReady = false
  }
}

async function runMigrations(p) {
  try {
    // 检查用户列表，为书架迁移收集所有的 user_id
    const [userRows] = await p.execute('SELECT id FROM my_read_users')
    let userIds = userRows.map(u => u.id)

    // 如果还没有任何注册用户，我们也可以读取本地 users.json 寻找用户 ID，或者至少放入 'admin' 和 'quick'。
    const localUsersFile = path.join(config.dataDir, 'users.json')
    if (fs.existsSync(localUsersFile)) {
      try {
        const localUsers = JSON.parse(fs.readFileSync(localUsersFile, 'utf8'))
        for (const u of localUsers) {
          if (!userIds.includes(u.id)) {
            // 把本地用户导入数据库
            await p.execute(`
              INSERT IGNORE INTO my_read_users
                (\`id\`, \`account\`, \`nickname\`, \`avatar_text\`, \`avatar_url\`, \`email\`, \`salt\`, \`password_hash\`, \`created_at\`)
              VALUES
                (:id, :account, :nickname, :avatarText, :avatarUrl, :email, :salt, :passwordHash, :createdAt)
            `, {
              id: u.id,
              account: u.account,
              nickname: u.nickname,
              avatarText: u.avatarText || u.nickname.slice(0, 1).toUpperCase(),
              avatarUrl: u.avatarUrl || '',
              email: u.email || '',
              salt: u.salt,
              passwordHash: u.passwordHash,
              createdAt: u.createdAt || new Date().toISOString()
            })
            userIds.push(u.id)
            console.log(`成功将本地用户迁移至数据库: ${u.account} (${u.id})`)
          }
        }
      } catch (err) {
        console.warn(`读取/迁移本地用户文件失败: ${err.message}`)
      }
    }

    if (userIds.length === 0) {
      // 至少加入 admin 和 quick，供隔离迁移使用
      userIds = ['admin', 'quick']
    }

    // 1. 迁移播放记录
    const [playbackCountRows] = await p.execute('SELECT COUNT(*) as count FROM my_read_playback_records')
    const hasPlaybackInDb = playbackCountRows[0].count > 0
    const localPlaybackFile = path.join(config.dataDir, 'playback-records.json')

    if (!hasPlaybackInDb && fs.existsSync(localPlaybackFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(localPlaybackFile, 'utf8'))
        let count = 0
        for (const [ownerId, books] of Object.entries(data)) {
          if (!books || typeof books !== 'object') continue
          for (const [bookId, record] of Object.entries(books)) {
            await p.execute(`
              INSERT IGNORE INTO my_read_playback_records
                (\`owner_id\`, \`book_id\`, \`book_title\`, \`chapter_id\`, \`chapter_name\`, \`chapter_index\`, \`chapter_count\`, \`current_time\`, \`duration\`, \`updated_at\`)
              VALUES
                (:owner_id, :book_id, :book_title, :chapter_id, :chapter_name, :chapter_index, :chapter_count, :current_time, :duration, :updated_at)
            `, {
              owner_id: ownerId,
              book_id: bookId,
              book_title: record.bookTitle || '',
              chapter_id: record.chapterId || '',
              chapter_name: record.chapterName || '',
              chapter_index: record.chapterIndex || 0,
              chapter_count: record.chapterCount || 0,
              current_time: record.currentTime || 0,
              duration: record.duration || 0,
              updated_at: record.updatedAt || Date.now()
            })
            count++
          }
        }
        console.log(`成功将历史收听记录热迁移导入至数据库，共 ${count} 条记录。`)
      } catch (err) {
        console.error(`热迁移播放记录失败: ${err.message}`)
      }
    }

    // 2. 迁移版本发布历史
    const [versionCountRows] = await p.execute('SELECT COUNT(*) as count FROM my_read_app_versions')
    const hasVersionsInDb = versionCountRows[0].count > 0
    const localVersionsFile = path.join(config.dataDir, 'app-versions.json')

    if (!hasVersionsInDb && fs.existsSync(localVersionsFile)) {
      try {
        const versions = JSON.parse(fs.readFileSync(localVersionsFile, 'utf8'))
        let count = 0
        for (const v of versions) {
          await p.execute(`
            INSERT IGNORE INTO my_read_app_versions
              (\`id\`, \`version_name\`, \`version_code\`, \`release_notes\`, \`apk_url\`, \`is_force_update\`, \`created_at\`)
            VALUES
              (:id, :versionName, :versionCode, :releaseNotes, :apkUrl, :isForceUpdate, :createdAt)
          `, {
            id: v.id,
            versionName: v.versionName,
            versionCode: v.versionCode,
            releaseNotes: v.releaseNotes || '',
            apkUrl: v.apkUrl || '',
            isForceUpdate: v.isForceUpdate ? 1 : 0,
            createdAt: v.createdAt || new Date().toISOString()
          })
          count++
        }
        console.log(`成功将历史应用版本迁移导入至数据库，共 ${count} 条记录。`)
      } catch (err) {
        console.error(`热迁移应用版本失败: ${err.message}`)
      }
    }

    // 3. 迁移订阅源
    const [sourceCountRows] = await p.execute('SELECT COUNT(*) as count FROM my_read_subscription_sources')
    const hasSourcesInDb = sourceCountRows[0].count > 0
    const localSourcesFile = path.join(config.dataDir, 'subscription-sources.json')

    if (!hasSourcesInDb && fs.existsSync(localSourcesFile)) {
      try {
        const sources = JSON.parse(fs.readFileSync(localSourcesFile, 'utf8'))
        let count = 0
        for (const s of sources) {
          await p.execute(`
            INSERT IGNORE INTO my_read_subscription_sources
              (\`id\`, \`name\`, \`url\`, \`created_at\`)
            VALUES
              (:id, :name, :url, NOW())
          `, {
            id: s.id,
            name: s.name,
            url: s.url
          })
          count++
        }
        console.log(`成功将历史订阅源迁移导入至数据库，共 ${count} 条记录。`)
      } catch (err) {
        console.error(`热迁移订阅源失败: ${err.message}`)
      }
    }

    // 如果订阅源表依然为空，且没有迁移任何数据，我们自动填入 6 个系统默认的有声源配置
    const [finalSourceCountRows] = await p.execute('SELECT COUNT(*) as count FROM my_read_subscription_sources')
    if (finalSourceCountRows[0].count === 0) {
      try {
        const defaultPresets = [
          { id: 'ting15', name: 'Ting15', url: 'https://m.ting15.com' },
          { id: 'bilibili', name: 'BiliBili', url: 'https://m.bilibili.com' },
          { id: 'kuwo', name: '酷我畅听', url: 'https://kuwo.cn' },
          { id: 'lanren', name: '懒人听书', url: 'https://m.lrts.me' },
          { id: 'bokan', name: '博看有声', url: 'https://voicewk.bookan.com.cn' },
          { id: 'yuntu', name: '云图有声', url: 'http://yuntuwechat.yuntuys.com' }
        ]
        let count = 0
        for (const p_item of defaultPresets) {
          await p.execute(`
            INSERT IGNORE INTO my_read_subscription_sources
              (\`id\`, \`name\`, \`url\`, \`created_at\`)
            VALUES
              (:id, :name, :url, NOW())
          `, p_item)
          count++
        }
        console.log(`已成功向数据库初始化导入 6 个系统默认有声书源！`)
      } catch (err) {
        console.error(`向数据库导入默认订阅源失败: ${err.message}`)
      }
    }

    // 4. 迁移收藏书架
    const [bookCountRows] = await p.execute('SELECT COUNT(*) as count FROM my_read_subscribed_books')
    const hasBooksInDb = bookCountRows[0].count > 0
    const localBooksFile = path.join(config.dataDir, 'subscribed-books.json')

    if (!hasBooksInDb && fs.existsSync(localBooksFile)) {
      try {
        const books = JSON.parse(fs.readFileSync(localBooksFile, 'utf8'))
        let count = 0
        for (const b of books) {
          for (const userId of userIds) {
            await p.execute(`
              INSERT IGNORE INTO my_read_subscribed_books
                (\`user_id\`, \`id\`, \`title\`, \`source_name\`, \`source_id\`, \`audio_url\`, \`author\`, \`chapters_json\`, \`created_at\`)
              VALUES
                (:user_id, :id, :title, :source_name, :source_id, :audio_url, :author, :chapters_json, NOW())
            `, {
              user_id: userId,
              id: b.id,
              title: b.title,
              source_name: b.sourceName || '',
              source_id: b.sourceId || '',
              audio_url: b.audioUrl || '',
              author: b.author || '',
              chapters_json: b.chapters ? JSON.stringify(b.chapters) : '[]'
            })
            count++
          }
        }
        console.log(`成功将历史收藏书架隔离热迁移导入至数据库，共 ${count} 条记录（多用户覆盖）。`)
      } catch (err) {
        console.error(`热迁移收藏书架失败: ${err.message}`)
      }
    }

  } catch (error) {
    console.error(`热迁移历史数据发生错误: ${error.message}`)
  }
}
