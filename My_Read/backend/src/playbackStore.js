import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

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

export function listPlaybackRecords(ownerId) {
  return Object.values(readStore()[ownerId] || {})
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
}

export function savePlaybackRecord(ownerId, input = {}) {
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

  const store = readStore()
  store[ownerId] = {
    ...(store[ownerId] || {}),
    [bookId]: record
  }
  writeStore(store)
  return record
}
