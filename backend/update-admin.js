import { randomBytes, createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

// 加载环境变量
dotenv.config()

const DATA_DIR = process.env.APP_DATA_DIR || path.resolve(process.cwd(), 'data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')

// 哈希加密算法（与原系统 userStore.js 保持完全一致）
function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = createHash('sha256').update(`${salt}:${password}`).digest('hex')
  return { salt, hash }
}

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
    connectionLimit: 5,
    namedPlaceholders: true
  }
}

async function run() {
  console.log('=== 极简听书管理员账号密码重置工具 ===')
  const newPassword = '6927656'
  const { salt, hash } = hashPassword(newPassword)

  console.log(`明文密码: ${newPassword}`)
  console.log(`生成的随机 Salt: ${salt}`)
  console.log(`生成的密码 Hash (SHA-256): ${hash}`)
  console.log('--------------------------------------')

  // 1. 尝试修改 MySQL 数据库中的 admin 密码
  const dbOptions = mysqlConfig()
  let mysqlUpdated = false
  if (dbOptions) {
    console.log('检测到 MySQL 配置，正在尝试连接数据库...')
    try {
      const { createPool } = await import('mysql2/promise')
      const pool = createPool(dbOptions)

      // 检查 admin 是否存在
      const [rows] = await pool.execute('SELECT id FROM my_read_users WHERE account = "admin"')
      if (rows.length === 0) {
        console.log('⚠️ MySQL 数据库中未找到 "admin" 账号，跳过 MySQL 更新。')
      } else {
        await pool.execute(
          `UPDATE my_read_users 
           SET salt = :salt, password_hash = :passwordHash 
           WHERE account = "admin"`,
          {
            salt,
            passwordHash: hash
          }
        )
        console.log('✅ 成功更新 MySQL 数据库中的 "admin" 账号密码！')
        mysqlUpdated = true
      }
      await pool.end()
    } catch (err) {
      console.warn(`⚠️ 无法更新 MySQL 数据库（原因: ${err.message}）。`)
    }
  } else {
    console.log('未检测到 MySQL 配置，跳过数据库阶段（如果是生产环境，请在服务器上运行此脚本或手动执行 SQL）。')
  }

  // 2. 尝试修改本地 JSON 文件中的 admin 密码
  let jsonUpdated = false
  try {
    if (fs.existsSync(USERS_FILE)) {
      const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
      const adminIndex = users.findIndex(u => u.account === 'admin')
      if (adminIndex !== -1) {
        users[adminIndex].salt = salt
        users[adminIndex].passwordHash = hash
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8')
        console.log('✅ 成功更新本地 JSON 文件中的 "admin" 账号密码！')
        jsonUpdated = true
      } else {
        console.log('⚠️ 本地 JSON 文件中未找到 "admin" 账号，跳过 JSON 更新。')
      }
    } else {
      console.log('ℹ️ 本地 JSON 用户文件不存在，跳过 JSON 更新。')
    }
  } catch (err) {
    console.error('❌ 写入本地 JSON 发生错误:', err.message)
  }

  console.log('\n======================================')
  if (mysqlUpdated || jsonUpdated) {
    console.log('🎉 密码修改完成！')
  } else {
    console.log('⚠️ 本地未执行任何修改，可能是因为账号不存在。')
  }
  
  console.log('\n💡 如果您需要手动在生产环境的数据库中修改密码，请执行以下 SQL 语句：')
  console.log(`UPDATE my_read_users SET salt = '${salt}', password_hash = '${hash}' WHERE account = 'admin';`)
  console.log('======================================')
}

run()
