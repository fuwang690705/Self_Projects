import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { getPool } from './db.js'

const PLAYBACK_FILE = path.join(config.dataDir, 'playback-records.json')

function ensureDataDir() {
  fs.mkdirSync(config.dataDir, { recursive: true })
}

function readStore() {
  try {
    if (!fs.existsSync(PLAYBACK_FILE)) return {}
    return JSON.parse(fs.readFileSync(PLAYBACK_FILE, 'utf8'))
  } catch (error) {
    console.warn(`Failed to read playback records: ${error.message}`)
    return {}
  }
}

function writeStore(store) {
  ensureDataDir()
  fs.writeFileSync(PLAYBACK_FILE, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
}

export function playbackOwnerId(user, clientId = '') {
  if (user?.id) return `user:${user.id}`
  const normalized = String(clientId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
  return normalized ? `client:${normalized}` : 'client:default'
}

export async function listPlaybackRecords(ownerId) {
  const pool = await getPool()
  if (pool) {
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM my_read_playback_records WHERE owner_id = :ownerId ORDER BY updated_at DESC',
        { ownerId }
      )
      return rows.map((row) => ({
        bookId: row.book_id,
        bookTitle: row.book_title,
        chapterId: row.chapter_id,
        chapterName: row.chapter_name,
        chapterIndex: row.chapter_index,
        chapterCount: row.chapter_count,
        currentTime: row.current_time,
        duration: row.duration,
        updatedAt: Number(row.updated_at)
      }))
    } catch (error) {
      console.warn(`从数据库读取播放进度失败: ${error.message}，将回退到本地存储。`)
    }
  }

  // Fallback to local JSON
  return Object.values(readStore()[ownerId] || {})
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
}

export async function savePlaybackRecord(ownerId, input = {}) {
  const bookId = String(input.bookId || '').trim()
  const chapterId = String(input.chapterId || '').trim()
  if (!bookId || !chapterId) return null

  const currentTime = Math.max(0, Number(input.currentTime) || 0)
  const duration = Math.max(0, Number(input.duration) || 0)
  const record = {
    bookId,
    bookTitle: String(input.bookTitle || '').trim(),
    chapterId,
    chapterName: String(input.chapterName || '').trim(),
    chapterIndex: Math.max(0, Number(input.chapterIndex) || 0),
    chapterCount: Math.max(0, Number(input.chapterCount) || 0),
    currentTime,
    duration,
    updatedAt: Date.now()
  }

  const pool = await getPool()
  if (pool) {
    try {
      await pool.execute(
        `INSERT INTO my_read_playback_records
          (\`owner_id\`, \`book_id\`, \`book_title\`, \`chapter_id\`, \`chapter_name\`, \`chapter_index\`, \`chapter_count\`, \`current_time\`, \`duration\`, \`updated_at\`)
         VALUES
          (:ownerId, :bookId, :bookTitle, :chapterId, :chapterName, :chapterIndex, :chapterCount, :currentTime, :duration, :updatedAt)
         ON DUPLICATE KEY UPDATE
          \`book_title\` = :bookTitle,
          \`chapter_id\` = :chapterId,
          \`chapter_name\` = :chapterName,
          \`chapter_index\` = :chapterIndex,
          \`chapter_count\` = :chapterCount,
          \`current_time\` = :currentTime,
          \`duration\` = :duration,
          \`updated_at\` = :updatedAt`,
        {
          ownerId,
          bookId: record.bookId,
          bookTitle: record.bookTitle,
          chapterId: record.chapterId,
          chapterName: record.chapterName,
          chapterIndex: record.chapterIndex,
          chapterCount: record.chapterCount,
          currentTime: record.currentTime,
          duration: record.duration,
          updatedAt: record.updatedAt
        }
      )
      return record
    } catch (error) {
      console.warn(`向数据库保存播放进度失败: ${error.message}，将回退到本地存储。`)
    }
  }

  // Fallback to local JSON
  const store = readStore()
  store[ownerId] = {
    ...(store[ownerId] || {}),
    [bookId]: record
  }
  writeStore(store)
  return record
}
