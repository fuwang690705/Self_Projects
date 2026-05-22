import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { AppError } from './errors.js'

const USERS_FILE = path.join(config.dataDir, 'users.json')
const sessions = new Map()
let mysqlPoolPromise
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

async function mysqlPool() {
  const options = mysqlConfig()
  if (!options) return null

  if (!mysqlPoolPromise) {
    mysqlPoolPromise = import('mysql2/promise').then(async ({ createPool }) => {
      const pool = createPool(options)
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
      await ensureMysqlUserProfileColumns(pool)
      mysqlReady = true
      return pool
    }).catch((error) => {
      mysqlPoolPromise = null
      console.warn(`MySQL user store unavailable, falling back to file store: ${error.message}`)
      return null
    })
  }

  return mysqlPoolPromise
}

async function ensureMysqlUserProfileColumns(pool) {
  for (const statement of [
    'ALTER TABLE my_read_users ADD COLUMN avatar_url TEXT NULL',
    'ALTER TABLE my_read_users ADD COLUMN email VARCHAR(255) NULL'
  ]) {
    try {
      await pool.execute(statement)
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME' && !String(error.message || '').includes('Duplicate column name')) throw error
    }
  }
}

function ensureDataDir() {
  fs.mkdirSync(config.dataDir, { recursive: true })
}

function readUsersFromFile() {
  try {
    if (!fs.existsSync(USERS_FILE)) return []
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
  } catch (error) {
    console.warn(`Failed to read local user file: ${error.message}`)
    return []
  }
}

function writeUsersToFile(users) {
  ensureDataDir()
  fs.writeFileSync(USERS_FILE, `${JSON.stringify(users, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = createHash('sha256').update(`${salt}:${password}`).digest('hex')
  return { salt, hash }
}

function safeEqual(a, b) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    account: user.account,
    nickname: user.nickname,
    avatarText: user.avatarText,
    avatarUrl: user.avatarUrl || '',
    email: user.email || '',
    createdAt: user.createdAt,
    storage: mysqlReady ? 'mysql' : 'file'
  }
}

function rowToUser(row) {
  if (!row) return null
  return {
    id: row.id,
    account: row.account,
    nickname: row.nickname,
    avatarText: row.avatar_text,
    avatarUrl: row.avatar_url || '',
    email: row.email || '',
    salt: row.salt,
    passwordHash: row.password_hash,
    createdAt: row.created_at?.toISOString?.() || row.created_at
  }
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((item) => item.trim().split('='))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  )
}

async function findUserByAccount(account) {
  const pool = await mysqlPool()
  if (pool) {
    const [rows] = await pool.execute('SELECT * FROM my_read_users WHERE account = :account LIMIT 1', { account })
    return rowToUser(rows[0])
  }

  return readUsersFromFile().find((item) => item.account === account) || null
}

async function findUserById(id) {
  const pool = await mysqlPool()
  if (pool) {
    const [rows] = await pool.execute('SELECT * FROM my_read_users WHERE id = :id LIMIT 1', { id })
    return rowToUser(rows[0])
  }

  return readUsersFromFile().find((item) => item.id === id) || null
}

async function saveUser(user) {
  const pool = await mysqlPool()
  if (pool) {
    await pool.execute(
      `INSERT INTO my_read_users
        (id, account, nickname, avatar_text, salt, password_hash, created_at)
       VALUES
        (:id, :account, :nickname, :avatarText, :salt, :passwordHash, NOW())`,
      user
    )
    return
  }

  const users = readUsersFromFile()
  users.push(user)
  writeUsersToFile(users)
}

export async function getSessionUser(req) {
  const token = parseCookies(req.headers.cookie).my_read_sid
  if (!token) return null
  const session = sessions.get(token)
  if (!session) return null

  return publicUser(await findUserById(session.userId))
}

export function attachSession(res, user) {
  const token = randomBytes(32).toString('base64url')
  sessions.set(token, {
    userId: user.id,
    createdAt: new Date().toISOString()
  })
  res.setHeader('Set-Cookie', `my_read_sid=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`)
  return publicUser(user)
}

export function clearSession(req, res) {
  const token = parseCookies(req.headers.cookie).my_read_sid
  if (token) sessions.delete(token)
  res.setHeader('Set-Cookie', 'my_read_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
}

export async function registerUser(input = {}) {
  const account = String(input.account || '').trim()
  const password = String(input.password || '')
  const nickname = String(input.nickname || account || '听书用户').trim()

  if (account.length < 3) throw new AppError('账号至少需要 3 个字符。', 400)
  if (password.length < 6) throw new AppError('密码至少需要 6 位。', 400)
  if (await findUserByAccount(account)) throw new AppError('这个账号已经注册。', 409)

  const { salt, hash } = hashPassword(password)
  const user = {
    id: randomBytes(12).toString('hex'),
    account,
    nickname,
    avatarText: nickname.slice(0, 1).toUpperCase(),
    avatarUrl: '',
    email: '',
    salt,
    passwordHash: hash,
    createdAt: new Date().toISOString()
  }

  await saveUser(user)
  return user
}

export async function loginUser(input = {}) {
  const account = String(input.account || '').trim()
  const password = String(input.password || '')
  const user = await findUserByAccount(account)
  if (!user) throw new AppError('账号或密码不正确。', 401)

  const { hash } = hashPassword(password, user.salt)
  if (!safeEqual(hash, user.passwordHash)) throw new AppError('账号或密码不正确。', 401)

  return user
}

export async function quickLoginUser() {
  const existing = await findUserByAccount('quick')
  if (existing) return existing

  const { salt, hash } = hashPassword(randomBytes(18).toString('hex'))
  const user = {
    id: randomBytes(12).toString('hex'),
    account: 'quick',
    nickname: '体验用户',
    avatarText: '听',
    avatarUrl: '',
    email: '',
    salt,
    passwordHash: hash,
    createdAt: new Date().toISOString()
  }

  await saveUser(user)
  return user
}

export async function updateUserProfile(userId, input = {}) {
  const user = await findUserById(userId)
  if (!user) throw new AppError('账号不存在。', 404)

  const nickname = String(input.nickname || '').trim()
  const avatarText = String(input.avatarText || user.avatarText || nickname.slice(0, 1) || '听').trim().slice(0, 2)
  const avatarUrl = String(input.avatarUrl || '').trim()
  const email = String(input.email || '').trim()

  if (nickname.length < 1 || nickname.length > 32) throw new AppError('昵称需要 1 到 32 个字符。', 400)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('邮箱格式不正确。', 400)

  const nextUser = {
    ...user,
    nickname,
    avatarText,
    avatarUrl,
    email
  }

  const pool = await mysqlPool()
  if (pool) {
    await pool.execute(
      `UPDATE my_read_users
       SET nickname = :nickname,
           avatar_text = :avatarText,
           avatar_url = :avatarUrl,
           email = :email
       WHERE id = :id`,
      {
        id: userId,
        nickname,
        avatarText,
        avatarUrl,
        email
      }
    )
    return publicUser(nextUser)
  }

  const users = readUsersFromFile()
  const index = users.findIndex((item) => item.id === userId)
  if (index === -1) throw new AppError('账号不存在。', 404)
  users[index] = nextUser
  writeUsersToFile(users)
  return publicUser(nextUser)
}
