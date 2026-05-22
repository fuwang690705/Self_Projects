import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { AppError } from './errors.js'
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

export function listSources() {
  return readJson(SOURCE_FILE, [])
}

export function upsertSource(payload) {
  const source = normalizeSource(payload)
  if (!source.name || !source.url) throw new AppError('订阅源名称和地址不能为空。', 400)
  const current = listSources()
  const next = [...current.filter((item) => item.id !== source.id), source]
  writeJson(SOURCE_FILE, next)
  return source
}

export function removeSource(id) {
  const current = listSources()
  const next = current.filter((item) => item.id !== id)
  writeJson(SOURCE_FILE, next)
}

export async function searchSources(keyword) {
  const query = String(keyword || '').trim().toLowerCase()
  if (!query) return []
  const sources = listSources()
  const all = await Promise.all([
    searchBuiltinSources(keyword).catch(() => []),
    ...sources.map(async (source) => {
      const response = await fetch(source.url)
      if (!response.ok) return []
      const xml = await response.text()
      const rows = parseRss(xml)
      return rows
        .filter((item) => item.title.toLowerCase().includes(query) || item.author.toLowerCase().includes(query))
        .map((item) => ({ ...item, sourceId: source.id, sourceName: source.name }))
    })
  ])
  return all.flat()
}

export function listSubscribedBooks() {
  return readJson(SUBSCRIBED_FILE, [])
}

export async function addSubscribedBook(payload = {}) {
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
  const current = listSubscribedBooks()
  const exists = current.some((row) => row.id === item.id || (item.audioUrl && row.audioUrl === item.audioUrl))
  if (!exists) {
    current.push(item)
    writeJson(SUBSCRIBED_FILE, current)
  }
  return item
}

export async function previewSubscribedBook(payload = {}) {
  if (payload.sourceKind !== 'website') {
    throw new AppError('仅网络书源支持详情预览。', 400)
  }
  return resolveSourceBook(payload)
}
