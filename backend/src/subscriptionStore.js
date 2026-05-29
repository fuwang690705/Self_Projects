import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { AppError } from './errors.js'
import { getPool } from './db.js'
import { resolveSourceBook, searchBuiltinSources } from './audioSourceParsers.js'

const SOURCE_FILE = path.join(config.dataDir, 'subscription-sources.json')
const SUBSCRIBED_FILE = path.join(config.dataDir, 'subscribed-books.json')

function ensureDataDir() {
  fs.mkdirSync(config.dataDir, { recursive: true })
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  ensureDataDir()
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function readSubscribedFallback(userId) {
  const data = readJson(SUBSCRIBED_FILE, {})
  if (Array.isArray(data)) {
    return data // Legacy flat array fallback
  }
  return data[userId] || []
}

function writeSubscribedFallback(userId, books) {
  let store = readJson(SUBSCRIBED_FILE, {})
  if (Array.isArray(store)) {
    store = { [userId || 'default']: store }
  }
  store[userId || 'default'] = books
  writeJson(SUBSCRIBED_FILE, store)
}

function normalizeSource(input = {}) {
  return {
    id: String(input.id || '').trim() || `src_${Date.now()}`,
    name: String(input.name || '').trim(),
    url: String(input.url || '').trim()
  }
}

function stripCdata(text = '') {
  return String(text).replace('<![CDATA[', '').replace(']]>', '').trim()
}

function xmlItems(xml) {
  return xml.match(/<item\b[\s\S]*?<\/item>/gi) || []
}

function xmlText(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return stripCdata(match?.[1] || '')
}

function xmlAttrs(block, tag) {
  const match = block.match(new RegExp(`<${tag}\\b([^>]*)\\/?>`, 'i'))
  return match?.[1] || ''
}

function attrValue(attrs, name) {
  const match = String(attrs).match(new RegExp(`${name}="([^"]*)"`, 'i'))
  return stripCdata(match?.[1] || '')
}

function parseRss(xml) {
  return xmlItems(xml).map((item) => {
    const enclosure = xmlAttrs(item, 'enclosure')
    return {
      id: xmlText(item, 'guid') || xmlText(item, 'link') || xmlText(item, 'title'),
      title: xmlText(item, 'title'),
      author: xmlText(item, 'author') || xmlText(item, 'itunes:author'),
      description: xmlText(item, 'description'),
      audioUrl: attrValue(enclosure, 'url')
    }
  }).filter((item) => item.title && item.audioUrl)
}

export async function listSources() {
  const pool = await getPool()
  if (pool) {
    try {
      const [rows] = await pool.execute('SELECT * FROM my_read_subscription_sources ORDER BY created_at DESC')
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        url: row.url
      }))
    } catch (error) {
      console.warn(`从数据库读取订阅源失败: ${error.message}，将回退到本地存储。`)
    }
  }
  return readJson(SOURCE_FILE, [])
}

export async function upsertSource(payload) {
  const source = normalizeSource(payload)
  if (!source.name || !source.url) throw new AppError('订阅源名称和地址不能为空。', 400)
  
  const pool = await getPool()
  if (pool) {
    try {
      await pool.execute(
        `INSERT INTO my_read_subscription_sources (id, name, url, created_at)
         VALUES (:id, :name, :url, NOW())
         ON DUPLICATE KEY UPDATE name = :name, url = :url`,
        {
          id: source.id,
          name: source.name,
          url: source.url
        }
      )
      return source
    } catch (error) {
      console.warn(`向数据库保存订阅源失败: ${error.message}，将回退到本地存储。`)
    }
  }

  const current = readJson(SOURCE_FILE, [])
  const next = [...current.filter((item) => item.id !== source.id), source]
  writeJson(SOURCE_FILE, next)
  return source
}

export async function removeSource(id) {
  const pool = await getPool()
  if (pool) {
    try {
      await pool.execute('DELETE FROM my_read_subscription_sources WHERE id = :id', { id })
      return
    } catch (error) {
      console.warn(`从数据库删除订阅源失败: ${error.message}，将回退到本地存储。`)
    }
  }

  const current = readJson(SOURCE_FILE, [])
  const next = current.filter((item) => item.id !== id)
  writeJson(SOURCE_FILE, next)
}

export async function searchSources(keyword) {
  const query = String(keyword || '').trim().toLowerCase()
  if (!query) return []
  const sources = await listSources()
  const all = await Promise.all([
    searchBuiltinSources(keyword).catch(() => []),
    ...sources.map(async (source) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 秒超短强行熔断防阻塞
      
      try {
        const response = await fetch(source.url, { signal: controller.signal })
        if (!response.ok) return []
        const xml = await response.text()
        const rows = parseRss(xml)
        return rows
          .filter((item) => item.title.toLowerCase().includes(query) || item.author.toLowerCase().includes(query))
          .map((item) => ({ ...item, sourceId: source.id, sourceName: source.name }))
      } catch (error) {
        if (error.name === 'AbortError') {
          console.warn(`获取订阅源超时已自动熔断: ${source.url}`)
        } else {
          console.warn(`获取/解析订阅源失败: ${source.url} - ${error.message}`)
        }
        return []
      } finally {
        clearTimeout(timeoutId)
      }
    })
  ])
  return all.flat()
}

export async function listSubscribedBooks(userId) {
  if (!userId) return []
  const pool = await getPool()
  if (pool) {
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM my_read_subscribed_books WHERE user_id = :userId ORDER BY created_at DESC',
        { userId }
      )
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        sourceName: row.source_name,
        sourceId: row.source_id,
        audioUrl: row.audio_url || '',
        author: row.author || '',
        chapters: row.chapters_json ? JSON.parse(row.chapters_json) : [],
        createdAt: row.created_at
      }))
    } catch (error) {
      console.warn(`从数据库读取已订阅书籍失败: ${error.message}，将回退到本地存储。`)
    }
  }

  return readSubscribedFallback(userId)
}

export async function addSubscribedBook(userId, payload = {}) {
  if (!userId) throw new AppError('用户未登录。', 401)
  const item = payload.sourceKind === 'website'
    ? await resolveSourceBook(payload)
    : {
        id: String(payload.id || '').trim() || `sub_${Date.now()}`,
        title: String(payload.title || '').trim(),
        sourceName: String(payload.sourceName || '').trim(),
        sourceId: String(payload.sourceId || '').trim(),
        audioUrl: String(payload.audioUrl || '').trim(),
        author: String(payload.author || '').trim()
      }
  if (!item.title || (!item.audioUrl && !item.chapters?.length)) throw new AppError('缺少订阅书籍信息。', 400)

  const pool = await getPool()
  if (pool) {
    try {
      const [rows] = await pool.execute(
        'SELECT COUNT(*) as count FROM my_read_subscribed_books WHERE user_id = :userId AND id = :id',
        { userId, id: item.id }
      )
      const exists = rows[0].count > 0
      if (!exists) {
        await pool.execute(
          `INSERT INTO my_read_subscribed_books
            (user_id, id, title, source_name, source_id, audio_url, author, chapters_json, created_at)
           VALUES
            (:userId, :id, :title, :sourceName, :sourceId, :audioUrl, :author, :chaptersJson, NOW())`,
          {
            userId,
            id: item.id,
            title: item.title,
            sourceName: item.sourceName || '',
            sourceId: item.sourceId || '',
            audioUrl: item.audioUrl || '',
            author: item.author || '',
            chaptersJson: item.chapters ? JSON.stringify(item.chapters) : '[]'
          }
        )
      }
      return item
    } catch (error) {
      console.warn(`向数据库保存订阅书籍失败: ${error.message}，将回退到本地存储。`)
    }
  }

  const current = readSubscribedFallback(userId)
  const exists = current.some((row) => row.id === item.id || (item.audioUrl && row.audioUrl === item.audioUrl))
  if (!exists) {
    current.push(item)
    writeSubscribedFallback(userId, current)
  }
  return item
}

export async function previewSubscribedBook(payload = {}) {
  if (payload.sourceKind !== 'website') {
    throw new AppError('仅网络书源支持详情预览。', 400)
  }
  return resolveSourceBook(payload)
}
