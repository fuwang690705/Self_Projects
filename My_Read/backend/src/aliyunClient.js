import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import ffmpegStaticPath from 'ffmpeg-static'
import { config, getAliyunPublicConfig, isAliyunConfigured, isLocalConfigured, isWebdavConfigured, updateAliyunConfig } from './config.js'
import { AppError } from './errors.js'
import { isSourceFileId, resolveSourceAudio } from './audioSourceParsers.js'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.wma'])
const FOLDER_TYPE = 'folder'
const MIME_BY_EXT = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.wma': 'audio/x-ms-wma'
}

function authHeader() {
  const token = Buffer.from(`${config.webdav.username}:${config.webdav.password}`).toString('base64')
  return `Basic ${token}`
}

function normalizeUrlPath(pathValue) {
  const value = String(pathValue || '/').trim() || '/'
  return value.startsWith('/') ? value : `/${value}`
}

function canonicalUrlPath(pathValue) {
  const path = normalizeUrlPath(pathValue).replace(/\/+$/, '')
  return path || '/'
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function baseUrlPathname() {
  try {
    return safeDecodeURIComponent(new URL(config.webdav.baseUrl).pathname).replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function fullWebdavUrl(pathValue) {
  const base = config.webdav.baseUrl.replace(/\/$/, '')
  const path = normalizeUrlPath(pathValue)
  return `${base}${path}`
}

function webdavPathFromHref(hrefValue) {
  let pathname = String(hrefValue || '').trim()

  try {
    pathname = new URL(pathname, config.webdav.baseUrl).pathname
  } catch {
    // Keep the raw href if URL parsing fails; it is still usually a valid DAV path.
  }

  pathname = canonicalUrlPath(safeDecodeURIComponent(pathname))

  const basePath = baseUrlPathname()
  if (basePath && basePath !== '/' && pathname.startsWith(`${basePath}/`)) {
    return canonicalUrlPath(pathname.slice(basePath.length))
  }
  if (basePath && pathname === basePath) return '/'

  return pathname
}

function fileIdFromPath(pathValue) {
  return Buffer.from(pathValue, 'utf8').toString('base64url')
}

function pathFromFileId(fileId) {
  return Buffer.from(fileId, 'base64url').toString('utf8')
}

function decodeEntities(text) {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
}

function parseMultistatus(xml) {
  const responses = []
  const responseBlocks = xml.match(/<[^>]*:?response[\s\S]*?<\/[^>]*:?response>/gi) || []

  for (const block of responseBlocks) {
    const hrefMatch = block.match(/<[^>]*:?href>([\s\S]*?)<\/[^>]*:?href>/i)
    if (!hrefMatch) continue

    const href = safeDecodeURIComponent(decodeEntities(hrefMatch[1].trim()))
    const isCollection = /<[^>]*:?collection\s*\/?\s*>/i.test(block)
    const sizeMatch = block.match(/<[^>]*:?getcontentlength>(\d+)<\/[^>]*:?getcontentlength>/i)
    const size = sizeMatch ? Number(sizeMatch[1]) : 0

    const name = href.split('/').filter(Boolean).pop() || ''
    responses.push({ href, name, isCollection, size })
  }

  return responses
}

async function propfind(pathValue, depth = '1') {
  const response = await fetch(fullWebdavUrl(pathValue), {
    method: 'PROPFIND',
    headers: {
      Authorization: authHeader(),
      Depth: depth,
      'Content-Type': 'application/xml; charset=utf-8'
    },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/></d:prop></d:propfind>'
  })

  if (!response.ok) {
    throw new AppError(`WebDAV 请求失败：${response.status}`, response.status)
  }

  const xml = await response.text()
  return parseMultistatus(xml)
}

function isAudioFile(name) {
  const dotIndex = name.lastIndexOf('.')
  const extension = dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : ''
  return AUDIO_EXTENSIONS.has(extension)
}

export function getAuthStatus() {
  return {
    ...getAliyunPublicConfig()
  }
}

export async function listAudioBook() {
  if (isLocalConfigured()) {
    return listLocalAudioBook()
  }

  if (isAliyunConfigured()) {
    return listAliyunAudioBooks()
  }

  if (!isWebdavConfigured()) {
    return [{
      id: 'empty-root',
      title: config.aliyun.bookTitle || config.webdav.bookTitle,
      rootFileId: config.aliyun.rootFileId || config.webdav.rootPath,
      chapters: []
    }]
  }

  return listWebdavAudioBook()
}

function localFileId(relPath) {
  return `local:${Buffer.from(relPath, 'utf8').toString('base64url')}`
}

function isLocalFileId(fileId) {
  return String(fileId || '').startsWith('local:')
}

function localPathFromFileId(fileId) {
  return Buffer.from(String(fileId || '').slice(6), 'base64url').toString('utf8')
}

function isRemoteFileId(fileId) {
  return String(fileId || '').startsWith('remote:')
}

function remoteUrlFromFileId(fileId) {
  return Buffer.from(String(fileId || '').slice(7), 'base64url').toString('utf8')
}

function extensionFromNameOrUrl(value) {
  const text = String(value || '')
  try {
    return path.extname(decodeURIComponent(new URL(text).pathname)).toLowerCase()
  } catch {
    return path.extname(text).toLowerCase()
  }
}

function walkAudioFiles(rootDir) {
  const files = []
  const queue = ['']
  while (queue.length) {
    const rel = queue.shift()
    const abs = path.join(rootDir, rel)
    const entries = fs.readdirSync(abs, { withFileTypes: true })
    for (const entry of entries) {
      const nextRel = rel ? path.join(rel, entry.name) : entry.name
      if (entry.isDirectory()) {
        queue.push(nextRel)
      } else if (entry.isFile() && isAudioFile(entry.name)) {
        const stat = fs.statSync(path.join(rootDir, nextRel))
        files.push({
          relPath: nextRel.replace(/\\/g, '/'),
          name: entry.name,
          size: stat.size || 0,
          updatedAt: stat.mtime.toISOString()
        })
      }
    }
  }
  return files
}

function groupLocalBooks(files) {
  const grouped = new Map()
  for (const file of files) {
    const metadata = parseLocalMetadata(file)
    const key = `${metadata.author || ''}/${metadata.bookTitle}`
    const bucket = grouped.get(key) || { ...metadata, items: [] }
    bucket.items.push({ ...file, ...metadata })
    grouped.set(key, bucket)
  }

  return [...grouped.values()].map((book) => ({
    id: `local-book:${Buffer.from(`${book.author || ''}/${book.bookTitle}`, 'utf8').toString('base64url')}`,
    title: book.bookTitle,
    author: book.author,
    rootFileId: book.bookTitle,
    chapters: book.items
      .map((item) => ({
        fileId: localFileId(item.relPath),
        name: item.chapterName,
        size: item.size,
        updatedAt: item.updatedAt,
        author: item.author,
        bookTitle: item.bookTitle
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
  }))
}

function cleanChapterName(fileName) {
  const withoutExt = fileName.replace(/\.[^.]+$/, '')
  return withoutExt.replace(/^\s*(第?\d+([.-]|章|回|集)?\s*)/i, '').trim() || withoutExt
}

function parseLocalMetadata(file) {
  const parts = file.relPath.split('/').filter(Boolean)
  const fallbackBookTitle = config.local.bookTitle || '本地听书'
  const chapterName = cleanChapterName(file.name)

  if (parts.length >= 3) {
    return {
      author: parts[0],
      bookTitle: parts[1],
      chapterName
    }
  }

  if (parts.length === 2) {
    return {
      author: '',
      bookTitle: parts[0],
      chapterName
    }
  }

  return {
    author: '',
    bookTitle: fallbackBookTitle,
    chapterName
  }
}

async function listLocalAudioBook() {
  const rootDir = config.local.rootDir
  if (!fs.existsSync(rootDir)) {
    fs.mkdirSync(rootDir, { recursive: true })
  }
  if (!fs.statSync(rootDir).isDirectory()) {
    throw new AppError('本地听书目录不是文件夹。', 500)
  }

  const files = walkAudioFiles(rootDir)
  const books = groupLocalBooks(files).filter((book) => book.chapters.length)
  if (books.length) return books

  return [{
    id: 'local-empty',
    title: config.local.bookTitle || '本地听书',
    rootFileId: 'local',
    chapters: []
  }]
}

async function listWebdavAudioBook() {
  const entries = await propfind(config.webdav.rootPath, '1')
  const rootPath = canonicalUrlPath(config.webdav.rootPath)

  const mappedEntries = entries
    .map((entry) => ({
      ...entry,
      path: webdavPathFromHref(entry.href)
    }))
    .filter((entry) => entry.path !== rootPath)

  const rootChapters = mappedEntries
    .filter((entry) => !entry.isCollection)
    .map(mapWebdavChapter)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))

  const folderBooks = await Promise.all(mappedEntries
    .filter((entry) => entry.isCollection)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
    .map(async (folder) => {
      const childEntries = await propfind(folder.path, '1')
      const chapters = childEntries
        .map((entry) => ({
          ...entry,
          path: webdavPathFromHref(entry.href)
        }))
        .filter((entry) => entry.path !== folder.path && !entry.isCollection)
        .map(mapWebdavChapter)
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))

      return {
        id: `webdav-folder:${fileIdFromPath(folder.path)}`,
        title: folder.name || '未命名听书',
        rootFileId: folder.path,
        chapters
      }
    }))

  const books = []
  if (rootChapters.length) {
    books.push({
      id: 'webdav-root',
      title: config.webdav.bookTitle,
      rootFileId: config.webdav.rootPath,
      chapters: rootChapters
    })
  }

  books.push(...folderBooks.filter((book) => book.chapters.length))

  return books.length ? books : [{
    id: 'webdav-root',
    title: config.webdav.bookTitle,
    rootFileId: config.webdav.rootPath,
    chapters: []
  }]
}

function mapWebdavChapter(entry) {
  if (!isAudioFile(entry.name)) return null
  return {
    fileId: fileIdFromPath(entry.path),
    name: entry.name,
    size: entry.size || 0,
    updatedAt: null
  }
}

export async function getAudioDownloadUrl(fileId) {
  if (!(isLocalConfigured() || isAliyunConfigured() || isWebdavConfigured() || isSourceFileId(fileId))) {
    throw new AppError('尚未完成听书源配置。', 401)
  }

  if (!fileId) {
    throw new AppError('缺少 fileId。', 400)
  }

  const duration = isLocalFileId(fileId) ? await getLocalAudioDuration(fileId) : null

  return {
    fileId,
    url: `/api/audio-stream/${encodeURIComponent(fileId)}`,
    expiration: null,
    method: 'GET',
    duration
  }
}

async function getLocalAudioDuration(fileId) {
  const resolvedPath = resolveLocalAudioPath(fileId)
  return probeAudioDuration(resolvedPath)
}

export async function createAudioStream(fileId, rangeHeader) {
  if (isSourceFileId(fileId)) {
    return createSourceAudioStream(fileId, rangeHeader)
  }

  if (isRemoteFileId(fileId)) {
    return createRemoteAudioStream(fileId, rangeHeader)
  }

  if (isLocalFileId(fileId)) {
    return createLocalAudioStream(fileId, rangeHeader)
  }

  if (isAliyunConfigured()) {
    return createAliyunAudioStream(fileId, rangeHeader)
  }

  if (!isWebdavConfigured()) {
    throw new AppError('尚未完成听书源配置。', 401)
  }

  const path = pathFromFileId(fileId)
  if (extensionFromNameOrUrl(path) === '.wma') {
    return createCachedTranscodedRemoteAudioStream(
      `webdav:${path}`,
      fullWebdavUrl(path),
      { Authorization: authHeader() },
      rangeHeader
    )
  }

  const headers = {
    Authorization: authHeader()
  }
  if (rangeHeader) headers.Range = rangeHeader

  const response = await fetch(fullWebdavUrl(path), {
    method: 'GET',
    headers
  })

  if (!(response.ok || response.status === 206)) {
    throw new AppError(`拉取音频失败：${response.status}`, response.status)
  }

  return response
}

function parseRange(rangeHeader, size) {
  if (!rangeHeader) return null
  const match = String(rangeHeader).match(/^bytes=(\d*)-(\d*)$/i)
  if (!match) return null

  let start = match[1] ? Number(match[1]) : 0
  let end = match[2] ? Number(match[2]) : size - 1
  if (!Number.isFinite(start) || start < 0) start = 0
  if (!Number.isFinite(end) || end >= size) end = size - 1
  if (start > end) return null

  return { start, end }
}

function createLocalAudioStream(fileId, rangeHeader) {
  const resolvedPath = resolveLocalAudioPath(fileId)
  const stat = fs.statSync(resolvedPath)
  const ext = path.extname(resolvedPath).toLowerCase()
  if (ext === '.wma') {
    return createCachedTranscodedAudioStream(resolvedPath, rangeHeader)
  }

  const contentType = MIME_BY_EXT[ext] || 'application/octet-stream'
  const headers = new Headers()
  headers.set('accept-ranges', 'bytes')
  headers.set('content-type', contentType)

  const range = parseRange(rangeHeader, stat.size)
  if (range) {
    headers.set('content-length', String(range.end - range.start + 1))
    headers.set('content-range', `bytes ${range.start}-${range.end}/${stat.size}`)
    return {
      localStream: fs.createReadStream(resolvedPath, { start: range.start, end: range.end }),
      headers,
      status: 206
    }
  }

  headers.set('content-length', String(stat.size))
  return {
    localStream: fs.createReadStream(resolvedPath),
    headers,
    status: 200
  }
}

function resolveLocalAudioPath(fileId) {
  const relPath = localPathFromFileId(fileId)
  const rootDir = path.resolve(config.local.rootDir)
  const resolvedPath = path.resolve(rootDir, relPath)
  const relativePath = path.relative(rootDir, resolvedPath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new AppError('非法文件路径。', 400)
  }
  if (!fs.existsSync(resolvedPath)) {
    throw new AppError('音频文件不存在。', 404)
  }
  if (!fs.statSync(resolvedPath).isFile()) {
    throw new AppError('目标不是音频文件。', 400)
  }

  return resolvedPath
}

function probeAudioDuration(resolvedPath) {
  const ffmpeg = process.env.FFMPEG_PATH || ffmpegStaticPath || 'ffmpeg'
  return new Promise((resolve) => {
    const processRef = spawn(ffmpeg, [
      '-hide_banner',
      '-i', resolvedPath,
      '-f', 'null',
      '-'
    ], {
      stdio: ['ignore', 'ignore', 'pipe']
    })

    let stderr = ''
    processRef.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    processRef.on('error', () => resolve(null))
    processRef.on('close', () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (!match) {
        resolve(null)
        return
      }

      resolve(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]))
    })
  })
}

function transcodedCachePath(resolvedPath) {
  const cacheDir = path.join(config.dataDir, 'transcoded-cache')
  const cacheName = Buffer.from(resolvedPath, 'utf8').toString('base64url')
  return path.join(cacheDir, `${cacheName}.mp3`)
}

function remoteSourceCachePath(cacheKey) {
  const cacheDir = path.join(config.dataDir, 'remote-source-cache')
  const cacheName = Buffer.from(cacheKey, 'utf8').toString('base64url')
  return path.join(cacheDir, `${cacheName}.wma`)
}

function ensureTranscodedCache(resolvedPath) {
  const cachePath = transcodedCachePath(resolvedPath)
  const sourceStat = fs.statSync(resolvedPath)
  const cacheStat = fs.existsSync(cachePath) ? fs.statSync(cachePath) : null
  if (cacheStat && cacheStat.size > 0 && cacheStat.mtimeMs >= sourceStat.mtimeMs) {
    return cachePath
  }

  const ffmpeg = process.env.FFMPEG_PATH || ffmpegStaticPath || 'ffmpeg'
  fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  const tempPath = `${cachePath}.tmp-${process.pid}-${Date.now()}`

  return new Promise((resolve, reject) => {
    const processRef = spawn(ffmpeg, [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', resolvedPath,
      '-vn',
      '-f', 'mp3',
      '-codec:a', 'libmp3lame',
      '-b:a', '128k',
      tempPath
    ], {
      stdio: ['ignore', 'ignore', 'pipe']
    })

    let stderr = ''
    processRef.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    processRef.on('error', (error) => {
      reject(new AppError(`音频转码启动失败：${error.message}`, 500))
    })

    processRef.on('close', (code) => {
      if (code && code !== 0) {
        reject(new AppError(`音频转码失败：${stderr || code}`, 500))
        return
      }
      fs.renameSync(tempPath, cachePath)
      resolve(cachePath)
    })
  })
}

async function createCachedTranscodedAudioStream(resolvedPath, rangeHeader) {
  const cachePath = await ensureTranscodedCache(resolvedPath)
  const stat = fs.statSync(cachePath)
  const headers = new Headers()
  headers.set('accept-ranges', 'bytes')
  headers.set('content-type', 'audio/mpeg')

  const range = parseRange(rangeHeader, stat.size)
  if (range) {
    headers.set('content-length', String(range.end - range.start + 1))
    headers.set('content-range', `bytes ${range.start}-${range.end}/${stat.size}`)
    return {
      localStream: fs.createReadStream(cachePath, { start: range.start, end: range.end }),
      headers,
      status: 206
    }
  }

  headers.set('content-length', String(stat.size))
  return {
    localStream: fs.createReadStream(cachePath),
    headers,
    status: 200
  }
}

async function downloadRemoteAudioToCache(cacheKey, downloadUrl, headers = {}) {
  const cachePath = remoteSourceCachePath(cacheKey)
  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
    return cachePath
  }

  fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  const tempPath = `${cachePath}.tmp-${process.pid}-${Date.now()}`
  const response = await fetch(downloadUrl, { method: 'GET', headers })
  if (!response.ok) {
    throw new AppError(`拉取 WMA 音频失败：${response.status}`, response.status)
  }

  await new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(tempPath)
    fileStream.on('error', reject)
    fileStream.on('finish', resolve)

    const reader = response.body?.getReader()
    if (!reader) {
      reject(new AppError('远程 WMA 音频没有返回内容。', 502))
      return
    }

    async function pump() {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!fileStream.write(Buffer.from(value))) {
            await new Promise((drainResolve) => fileStream.once('drain', drainResolve))
          }
        }
        fileStream.end()
      } catch (error) {
        fileStream.destroy(error)
        reject(error)
      }
    }

    pump()
  })

  fs.renameSync(tempPath, cachePath)
  return cachePath
}

async function createCachedTranscodedRemoteAudioStream(cacheKey, downloadUrl, headers, rangeHeader) {
  const sourcePath = await downloadRemoteAudioToCache(cacheKey, downloadUrl, headers)
  return createCachedTranscodedAudioStream(sourcePath, rangeHeader)
}

async function createRemoteAudioStream(fileId, rangeHeader) {
  const url = remoteUrlFromFileId(fileId)
  if (!/^https?:\/\//i.test(url)) {
    throw new AppError('远程音频地址无效。', 400)
  }

  if (extensionFromNameOrUrl(url) === '.wma') {
    return createCachedTranscodedRemoteAudioStream(`remote:${url}`, url, {}, rangeHeader)
  }

  const headers = {}
  if (rangeHeader) headers.Range = rangeHeader
  const response = await fetch(url, { method: 'GET', headers })
  if (!(response.ok || response.status === 206)) {
    throw new AppError(`拉取远程音频失败：${response.status}`, response.status)
  }
  return response
}

async function createSourceAudioStream(fileId, rangeHeader) {
  const source = await resolveSourceAudio(fileId)
  const headers = { ...(source.headers || {}) }
  if (rangeHeader) headers.Range = rangeHeader

  const response = await fetch(source.url, {
    method: 'GET',
    headers
  })

  if (!(response.ok || response.status === 206)) {
    throw new AppError(`拉取书源音频失败：${response.status}`, response.status)
  }

  if (source.contentType) {
    const headers = new Headers(response.headers)
    headers.set('content-type', source.contentType)
    return {
      status: response.status,
      headers,
      body: response.body
    }
  }

  return response
}

function aliyunApiUrl(pathname) {
  const base = config.aliyun.apiBase || 'https://openapi.alipan.com'
  return `${base.replace(/\/$/, '')}${pathname}`
}

function aliyunFileId(rawFileId, name = '') {
  const encodedName = name ? Buffer.from(name, 'utf8').toString('base64url') : ''
  return encodedName ? `aliyun:${rawFileId}:${encodedName}` : `aliyun:${rawFileId}`
}

function rawAliyunFileId(fileId) {
  if (!String(fileId || '').startsWith('aliyun:')) return String(fileId || '')
  return String(fileId).slice(7).split(':')[0]
}

function aliyunNameFromFileId(fileId) {
  const parts = String(fileId || '').split(':')
  if (parts.length < 3) return ''
  try {
    return Buffer.from(parts.slice(2).join(':'), 'base64url').toString('utf8')
  } catch {
    return ''
  }
}

async function refreshAliyunToken() {
  if (!config.aliyun.refreshToken) return false

  const response = await fetch(aliyunApiUrl('/v2/oauth/token'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: config.aliyun.refreshToken,
      client_id: config.aliyun.clientId || undefined,
      client_secret: config.aliyun.clientSecret || undefined
    })
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.access_token) return false

  updateAliyunConfig({
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || config.aliyun.refreshToken,
    driveId: payload.resource_drive_id || payload.default_drive_id || payload.backup_drive_id || config.aliyun.driveId,
    rootFileId: config.aliyun.rootFileId || 'root'
  })

  return true
}

async function aliyunRequest(pathname, body, { retry = true } = {}) {
  const response = await fetch(aliyunApiUrl(pathname), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.aliyun.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (response.status === 401 && retry && await refreshAliyunToken()) {
    return aliyunRequest(pathname, body, { retry: false })
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new AppError(payload?.message || `阿里云盘请求失败：${response.status}`, response.status, payload)
  }

  return payload
}

async function listAliyunChildren(parentFileId) {
  const items = []
  let marker = ''

  do {
    const payload = await aliyunRequest('/adrive/v1.0/openFile/list', {
      drive_id: config.aliyun.driveId,
      parent_file_id: parentFileId || config.aliyun.rootFileId || 'root',
      limit: 100,
      marker,
      order_by: 'name',
      order_direction: 'ASC'
    })

    items.push(...(payload.items || []))
    marker = payload.next_marker || ''
  } while (marker)

  return items
}

function isAliyunAudioFile(item) {
  return item?.type === 'file' && isAudioFile(item.name || '')
}

function mapAliyunChapter(item) {
  return {
    fileId: aliyunFileId(item.file_id, item.name),
    name: item.name,
    size: item.size || 0,
    updatedAt: item.updated_at || item.updatedAt || null
  }
}

async function listAliyunAudioBooks() {
  const rootFileId = config.aliyun.rootFileId || 'root'
  const rootItems = await listAliyunChildren(rootFileId)
  const rootAudio = rootItems
    .filter(isAliyunAudioFile)
    .map(mapAliyunChapter)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))

  const folders = rootItems
    .filter((item) => item.type === FOLDER_TYPE)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN', { numeric: true }))

  const books = []
  if (rootAudio.length) {
    books.push({
      id: aliyunFileId(rootFileId),
      title: config.aliyun.bookTitle || '我的听书',
      rootFileId,
      chapters: rootAudio
    })
  }

  const folderBooks = await Promise.all(folders.map(async (folder) => {
    const chapters = (await listAliyunChildren(folder.file_id))
      .filter(isAliyunAudioFile)
      .map(mapAliyunChapter)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))

    return {
      id: aliyunFileId(folder.file_id),
      title: folder.name || '未命名听书',
      rootFileId: folder.file_id,
      chapters
    }
  }))

  books.push(...folderBooks.filter((book) => book.chapters.length))

  return books.length ? books : [{
    id: aliyunFileId(rootFileId),
    title: config.aliyun.bookTitle || '我的听书',
    rootFileId,
    chapters: []
  }]
}

async function getAliyunDownloadUrl(fileId) {
  const payload = await aliyunRequest('/adrive/v1.0/openFile/getDownloadUrl', {
    drive_id: config.aliyun.driveId,
    file_id: rawAliyunFileId(fileId)
  })

  const url = payload.url || payload.download_url
  if (!url) throw new AppError('阿里云盘没有返回可播放链接。', 502, payload)
  return url
}

async function createAliyunAudioStream(fileId, rangeHeader) {
  const url = await getAliyunDownloadUrl(fileId)
  const name = aliyunNameFromFileId(fileId)

  if (extensionFromNameOrUrl(name) === '.wma' || extensionFromNameOrUrl(url) === '.wma') {
    return createCachedTranscodedRemoteAudioStream(`aliyun:${rawAliyunFileId(fileId)}:${name}`, url, {}, rangeHeader)
  }

  const headers = {}
  if (rangeHeader) headers.Range = rangeHeader

  const response = await fetch(url, {
    method: 'GET',
    headers
  })

  if (!(response.ok || response.status === 206)) {
    throw new AppError(`拉取阿里云盘音频失败：${response.status}`, response.status)
  }

  return response
}
