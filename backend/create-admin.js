import { randomBytes, createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const DATA_DIR = process.env.APP_DATA_DIR || path.resolve(process.cwd(), 'data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')

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
  console.log('=== 极简听书管理员账号自动创建工具 ===')
  const { salt, hash } = hashPassword('admin')
  const adminUser = {
    id: randomBytes(12).toString('hex'),
    account: 'admin',
    nickname: '系统管理员',
    avatarText: '管',
    avatarUrl: '',
    email: '',
    salt,
    passwordHash: hash,
    createdAt: new Date().toISOString()
  }

  // 1. 尝试写入 MySQL 数据库
  const dbOptions = mysqlConfig()
  let mysqlSuccess = false
  if (dbOptions) {
    console.log('检测到 MySQL 配置，正在尝试连接数据库...')
    try {
      const { createPool } = await import('mysql2/promise')
      const pool = createPool(dbOptions)
      
      // 确保表存在
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS my_read_users (
          id VARCHAR(32) PRIMARY KEY,
          account VARCHAR(128) NOT NULL UNIQUE,
          nickname VARCHAR(128) NOT NULL,
          avatar_text VARCHAR(16) NOT NULL,
          avatar_url TEXT NULL,
          email VARCHAR(255) NULL,
          salt VARCHAR(64) NOT NULL,
          password_hash VARCHAR(128) NOT NULL,
          created_at DATETIME NOT NULL
        )
      `)

      // 检查 admin 是否已存在
      const [rows] = await pool.execute('SELECT id FROM my_read_users WHERE account = "admin"')
      if (rows.length > 0) {
        console.log('MySQL 数据库中已存在 "admin" 账号，跳过写入数据库。')
      } else {
        await pool.execute(
          `INSERT INTO my_read_users 
            (id, account, nickname, avatar_text, salt, password_hash, created_at)
           VALUES 
            (:id, "admin", "系统管理员", "管", :salt, :passwordHash, NOW())`,
          {
            id: adminUser.id,
            salt,
            passwordHash: hash
          }
        )
        console.log('✅ 成功将 "admin" 账号创建至 MySQL 数据库。')
      }
      await pool.end()
      mysqlSuccess = true
    } catch (err) {
      console.warn(`⚠️ 无法写入 MySQL 数据库（${err.message}），将仅写入本地 JSON 文件。`)
    }
  } else {
    console.log('未检测到 MySQL 配置，跳过数据库阶段。')
  }

  // 2. 写入本地 JSON 文件备份
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    let users = []
    if (fs.existsSync(USERS_FILE)) {
      users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
    }
    
    const exists = users.some(u => u.account === 'admin')
    if (exists) {
      console.log('本地 JSON 文件中已存在 "admin" 账号，跳过写入文件。')
    } else {
      users.push({
        id: adminUser.id,
        account: 'admin',
        nickname: '系统管理员',
        avatarText: '管',
        avatarUrl: '',
        email: '',
        salt,
        passwordHash: hash,
        createdAt: adminUser.createdAt
      })
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8')
      console.log('✅ 成功将 "admin" 账号创建至本地 JSON 文件存储。')
    }
  } catch (err) {
    console.error('❌ 写入本地 JSON 发生错误:', err.message)
  }

  console.log('\n账号创建完成！')
  console.log('账号名称: admin')
  console.log('初始密码: admin (建议登录后前往“我的 -> 个人信息”进行修改)')
  console.log('======================================')
}

run()
