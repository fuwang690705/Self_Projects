import { Buffer } from 'node:buffer'
import { AppError } from './errors.js'

const REQUEST_HEADERS = {
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
}

const SOURCES = {
  ting15: {
    id: 'ting15',
    name: 'Ting15',
    baseUrl: 'https://m.ting15.com'
  },
  bilibili: {
    id: 'bilibili',
    name: 'BiliBili',
    baseUrl: 'https://m.bilibili.com',
    apiBaseUrl: 'https://api.bilibili.com'
  },
  kuwo: {
    id: 'kuwo',
    name: '\u9177\u6211\u7545\u542c',
    baseUrl: 'https://kuwo.cn',
    searchBaseUrl: 'http://baby.kuwo.cn',
    albumBaseUrl: 'https://search.kuwo.cn',
    audioBaseUrl: 'https://antiserver.kuwo.cn'
  },
  lanren: {
    id: 'lanren',
    name: '\u61d2\u4eba\u542c\u4e66',
    baseUrl: 'https://m.lrts.me'
  },
  bokan: {
    id: 'bokan',
    name: '\u535a\u770b\u6709\u58f0',
    baseUrl: 'https://voicewk.bookan.com.cn',
    apiBaseUrl: 'https://api.bookan.com.cn',
    searchBaseUrl: 'https://es.bookan.com.cn',
    instanceId: '25304'
  },
  yuntu: {
    id: 'yuntu',
    name: '\u4e91\u56fe\u6709\u58f0',
    baseUrl: 'http://yuntuwechat.yuntuys.com',
    apiBaseUrl: 'http://open-service.yuntuys.com',
    wechatId: '07955551-706c-4259-9aa0-db4627dfca57'
  }
}

function decodeEntities(text = '') {
  return String(text)
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function stripTags(text = '') {
  return decodeEntities(String(text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
}

function absoluteUrl(value, baseUrl) {
  return new URL(decodeEntities(value), baseUrl).href
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...REQUEST_HEADERS,
      ...(options.headers || {})
    }
  })
  if (!response.ok) throw new AppError(`Source request failed: ${response.status}`, response.status)
  return response.text()
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...REQUEST_HEADERS,
      accept: 'application/json,text/plain,*/*',
      ...(options.headers || {})
    }
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new AppError(`Source request failed: ${response.status}`, response.status)
  return data
}

function metaContent(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`<meta\\s+name=["']${escaped}["']\\s+content=["']([^"']*)["']`, 'i'))
  return decodeEntities(match?.[1] || '')
}

function sourceFileId(payload) {
  return `source:${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`
}

export function isSourceFileId(fileId) {
  return String(fileId || '').startsWith('source:')
}

function sourcePayloadFromFileId(fileId) {
  try {
    return JSON.parse(Buffer.from(String(fileId || '').slice(7), 'base64url').toString('utf8'))
  } catch {
    throw new AppError('Invalid source chapter id.', 400)
  }
}

function parseTing15Search(html) {
  const source = SOURCES.ting15
  const items = []
  const blocks = html.match(/<a\s+href=["']([^"']+\.html)["'][^>]*>\s*<dl>[\s\S]*?<\/dl>\s*<\/a>/gi) || []

  for (const block of blocks) {
    const href = block.match(/<a\s+href=["']([^"']+)["']/i)?.[1]
    const title = stripTags(block.match(/<h3>([\s\S]*?)<\/h3>/i)?.[1] || '')
    if (!href || !title) continue

    const cover = block.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || ''
    const author = stripTags(block.match(/<p>\s*作者：([\s\S]*?)<\/p>/i)?.[1] || '')
    const narrator = stripTags(block.match(/<p>\s*播音：([\s\S]*?)<\/p>/i)?.[1] || '')
    const category = stripTags(block.match(/<p>\s*类别：([\s\S]*?)<\/p>/i)?.[1] || '')
    const detailUrl = absoluteUrl(href, source.baseUrl)

    items.push({
      id: `site:${source.id}:${Buffer.from(detailUrl, 'utf8').toString('base64url')}`,
      type: 'book',
      sourceKind: 'website',
      sourceId: source.id,
      sourceName: source.name,
      title,
      author,
      narrator,
      category,
      description: [author && `author: ${author}`, narrator && `narrator: ${narrator}`, category].filter(Boolean).join(' · '),
      coverUrl: cover ? absoluteUrl(cover, source.baseUrl) : '',
      detailUrl
    })
  }

  return items
}

function cleanBilibiliTitle(text = '') {
  return stripTags(String(text).replaceAll('<em class="keyword">', '').replaceAll('</em>', ''))
}

function bilibiliBvidFromUrl(url = '') {
  const match = String(url).match(/\/video\/(BV[a-zA-Z0-9]+)/i) || String(url).match(/\b(BV[a-zA-Z0-9]+)\b/i)
  return match?.[1] || ''
}

function parseBilibiliSearch(data) {
  const source = SOURCES.bilibili
  const videoBlock = data?.data?.result?.find((item) => item?.result_type === 'video')
  const videos = Array.isArray(videoBlock?.data) ? videoBlock.data : []

  return videos.map((video) => {
    const bvid = String(video.bvid || '').trim()
    const title = cleanBilibiliTitle(video.title || '')
    const detailUrl = bvid ? `${source.baseUrl}/video/${bvid}` : ''
    return {
      id: `site:${source.id}:${Buffer.from(detailUrl, 'utf8').toString('base64url')}`,
      type: 'book',
      sourceKind: 'website',
      sourceId: source.id,
      sourceName: source.name,
      title,
      author: '',
      narrator: String(video.author || ''),
      category: 'video',
      description: [video.author && `UP: ${video.author}`, video.play != null && `play: ${video.play}`].filter(Boolean).join(' · '),
      coverUrl: video.pic ? absoluteUrl(String(video.pic).startsWith('//') ? `https:${video.pic}` : video.pic, source.baseUrl) : '',
      detailUrl
    }
  }).filter((item) => item.title && item.detailUrl)
}

function sourceBookSearchItem(source, fields = {}) {
  const detailUrl = fields.detailUrl || `${source.baseUrl}/`
  return {
    id: `site:${source.id}:${Buffer.from(detailUrl, 'utf8').toString('base64url')}`,
    type: 'book',
    sourceKind: 'website',
    sourceId: source.id,
    sourceName: source.name,
    title: String(fields.title || '').trim(),
    author: String(fields.author || '').trim(),
    narrator: String(fields.narrator || '').trim(),
    category: String(fields.category || '').trim(),
    description: String(fields.description || '').trim(),
    coverUrl: fields.coverUrl || '',
    detailUrl,
    ...fields.extra
  }
}

function sourceBookId(source, detailUrl) {
  return `source-book:${source.id}:${Buffer.from(detailUrl, 'utf8').toString('base64url')}`
}

function numberValue(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export async function searchBuiltinSources(keyword) {
  const query = String(keyword || '').trim()
  if (!query) return []

  const results = await Promise.all([
    searchTing15(query).catch(() => []),
    searchBilibili(query).catch(() => []),
    searchKuwo(query).catch(() => []),
    searchLanren(query).catch(() => []),
    searchBokan(query).catch(() => []),
    searchYuntu(query).catch(() => [])
  ])

  return results.flat()
}

async function searchTing15(query) {
  const url = `${SOURCES.ting15.baseUrl}/?s=ting-search-wd-${encodeURIComponent(query)}`
  const html = await fetchText(url, { headers: { referer: `${SOURCES.ting15.baseUrl}/` } })
  return parseTing15Search(html).filter((item) => {
    const haystack = `${item.title} ${item.author} ${item.narrator}`.toLowerCase()
    return haystack.includes(query.toLowerCase())
  })
}

async function searchBilibili(query) {
  const url = `${SOURCES.bilibili.apiBaseUrl}/x/web-interface/search/all/v2?keyword=${encodeURIComponent(query)}&page=1&pagesize=20`
  const data = await fetchJson(url, { headers: { referer: `${SOURCES.bilibili.baseUrl}/` } })
  if (data.code !== 0) return []
  return parseBilibiliSearch(data)
}

async function searchKuwo(query) {
  const source = SOURCES.kuwo
  const url = `${source.searchBaseUrl}/tingshu/api/search/Search?rn=10&type=album&version=8.5.6.1&wd=${encodeURIComponent(query)}&pn=1&kweexVersion=1.0.2`
  const data = await fetchJson(url, { headers: { referer: `${source.baseUrl}/` } })
  const rows = Array.isArray(data?.data?.data) ? data.data.data : []
  return rows.map((item) => {
    const albumId = String(item.albumId || '').trim()
    const detailUrl = `${source.baseUrl}/album_detail/${albumId}`
    return sourceBookSearchItem(source, {
      title: item.albumName,
      narrator: item.artistName,
      description: [item.artistName && `narrator: ${item.artistName}`, item.songTotal && `chapters: ${item.songTotal}`, item.title].filter(Boolean).join(' | '),
      coverUrl: item.coverImg || '',
      detailUrl,
      extra: {
        albumId,
        chapterCount: numberValue(item.songTotal)
      }
    })
  }).filter((item) => item.title && item.albumId)
}

async function searchLanren(query) {
  const source = SOURCES.lanren
  const url = `${source.baseUrl}/ajax/search?keyWord=${encodeURIComponent(query)}&pageSize=20&pageNum=1&searchOption=1`
  const data = await fetchJson(url, { headers: { referer: `${source.baseUrl}/` } })
  const rows = Array.isArray(data?.data?.bookResult?.list) ? data.data.bookResult.list : []
  return rows.map((item) => {
    const bookId = String(item.id || '').trim()
    const tags = JSON.stringify(item.tags || [])
    const paidLabel = tags.includes('VIP') ? 'VIP' : tags.includes('\u7cbe\u54c1') ? '\u7cbe\u54c1' : ''
    return sourceBookSearchItem(source, {
      title: paidLabel ? `[${paidLabel}] ${item.name || ''}` : item.name,
      author: item.author,
      narrator: item.announcer,
      description: [item.announcer && `narrator: ${item.announcer}`, item.sections && `chapters: ${item.sections}`, item.desc || item.recReason].filter(Boolean).join(' | '),
      coverUrl: item.cover || '',
      detailUrl: `${source.baseUrl}/book/${bookId}`,
      extra: {
        bookId,
        chapterCount: numberValue(item.sections)
      }
    })
  }).filter((item) => item.title && item.bookId)
}

async function searchBokan(query) {
  const source = SOURCES.bokan
  const urls = [
    `${source.searchBaseUrl}/api/v3/voice/book?instanceId=${source.instanceId}&keyword=${encodeURIComponent(query)}&pageNum=1&limitNum=20`,
    `${source.searchBaseUrl}/api/v3/voice/album?instanceId=${source.instanceId}&keyword=${encodeURIComponent(query)}&pageNum=1&limitNum=20`
  ]
  const lists = await Promise.all(urls.map((url) => fetchJson(url, { headers: { referer: `${source.baseUrl}/` } }).catch(() => ({}))))
  const seen = new Set()
  return lists.flatMap((data) => Array.isArray(data?.data?.list) ? data.data.list : []).map((item) => {
    const albumId = String(item.id || '').trim()
    const detailUrl = `${source.baseUrl}/${albumId}`
    return sourceBookSearchItem(source, {
      title: item.name,
      description: item.total ? `chapters: ${item.total}` : '',
      coverUrl: item.cover || '',
      detailUrl,
      extra: {
        albumId,
        chapterCount: numberValue(item.total)
      }
    })
  }).filter((item) => {
    if (!item.title || !item.albumId || seen.has(item.albumId)) return false
    seen.add(item.albumId)
    return true
  })
}

async function searchYuntu(query) {
  const source = SOURCES.yuntu
  const url = `${source.apiBaseUrl}/api/w_ys/book/search/wechat:${source.wechatId}/${encodeURIComponent(query)}?pageSize=20&pageNum=1`
  const data = await fetchJson(url, { headers: { referer: `${source.baseUrl}/` } })
  const rows = Array.isArray(data?.data?.list) ? data.data.list : []
  return rows.map((item) => {
    const bookId = String(item.bookId || '').trim()
    const detailUrl = `${source.baseUrl}/book/${bookId}`
    return sourceBookSearchItem(source, {
      title: item.bookName,
      author: item.authorName,
      narrator: item.anchorName,
      description: [item.anchorName && `narrator: ${item.anchorName}`, item.chapters && `chapters: ${item.chapters}`, item.summary].filter(Boolean).join(' | '),
      coverUrl: item.cover || '',
      detailUrl,
      extra: {
        bookId,
        chapterCount: numberValue(item.chapters)
      }
    })
  }).filter((item) => item.title && item.bookId)
}

function parseTing15Book(html, detailUrl) {
  const source = SOURCES.ting15
  const title = stripTags(html.match(/<section\s+class=["']bookinfo["'][\s\S]*?<h1>([\s\S]*?)<\/h1>/i)?.[1] || '')
    || stripTags(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/有声小说.*/, '')
  const coverRaw = html.match(/<section\s+class=["']bookinfo["'][\s\S]*?<img[^>]+src=["']([^"']+)["']/i)?.[1] || ''
  const author = stripTags(html.match(/<p>\s*作者：([\s\S]*?)<\/p>/i)?.[1] || '')
  const narrator = stripTags(html.match(/<p>\s*播音：([\s\S]*?)<\/p>/i)?.[1] || '')
  const count = Number(html.match(/分集收听\(共(\d+)集\)/)?.[1] || 0)

  const chapters = []
  const seen = new Set()
  for (const match of html.matchAll(/<a[^>]+href=["']([^"']+\/0-(\d+)\.html)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const pageUrl = absoluteUrl(match[1], detailUrl)
    if (seen.has(pageUrl)) continue
    const index = Number(match[2])
    const label = stripTags(match[3]) || String(index)
    if (label.startsWith('上次听到')) continue
    seen.add(pageUrl)
    chapters.push({
      fileId: sourceFileId({ sourceId: source.id, pageUrl }),
      name: /^\d+$/.test(label) ? `第${label}集` : label,
      size: 0,
      updatedAt: null,
      sourcePageUrl: pageUrl
    })
  }

  chapters.sort((a, b) => {
    const aIndex = Number(a.sourcePageUrl.match(/\/0-(\d+)\.html/)?.[1] || 0)
    const bIndex = Number(b.sourcePageUrl.match(/\/0-(\d+)\.html/)?.[1] || 0)
    return aIndex - bIndex
  })

  return {
    id: `source-book:${source.id}:${Buffer.from(detailUrl, 'utf8').toString('base64url')}`,
    title,
    author,
    narrator,
    sourceId: source.id,
    sourceName: source.name,
    detailUrl,
    coverUrl: coverRaw ? absoluteUrl(coverRaw, detailUrl) : '',
    chapterCount: count || chapters.length,
    chapters
  }
}

async function resolveBilibiliBook(payload = {}) {
  const source = SOURCES.bilibili
  const bvid = String(payload.bvid || '').trim() || bilibiliBvidFromUrl(payload.detailUrl)
  if (!bvid) throw new AppError('Missing bilibili bvid.', 400)

  const detailUrl = `${source.baseUrl}/video/${bvid}`
  const data = await fetchJson(`${source.apiBaseUrl}/x/web-interface/view/detail?aid=&bvid=${encodeURIComponent(bvid)}`, {
    headers: { referer: detailUrl }
  })
  if (data.code !== 0 || !data.data?.View) {
    throw new AppError(data.message || 'BiliBili detail request failed.', 502)
  }

  const view = data.data.View
  const pages = Array.isArray(view.pages) ? view.pages : []
  const chapters = pages.map((page) => {
    const pageIndex = Number(page.page || 1)
    const cid = String(page.cid || '')
    const pageUrl = `${source.baseUrl}/video/${bvid}?p=${pageIndex}`
    return {
      fileId: sourceFileId({ sourceId: source.id, bvid, cid, page: pageIndex, pageUrl }),
      name: page.part || `P${pageIndex}`,
      size: 0,
      updatedAt: null,
      sourcePageUrl: pageUrl,
      duration: page.duration || 0
    }
  }).filter((chapter) => chapter.fileId)

  return {
    id: `source-book:${source.id}:${Buffer.from(detailUrl, 'utf8').toString('base64url')}`,
    title: cleanBilibiliTitle(view.title || ''),
    author: '',
    narrator: view.owner?.name || '',
    sourceId: source.id,
    sourceName: source.name,
    detailUrl,
    coverUrl: view.pic || '',
    chapterCount: chapters.length,
    chapters
  }
}

async function resolveKuwoBook(payload = {}) {
  const source = SOURCES.kuwo
  const albumId = String(payload.albumId || payload.detailUrl?.match(/(\d+)(?:\D*)$/)?.[1] || '').trim()
  if (!albumId) throw new AppError('Missing KuWo album id.', 400)

  const detailUrl = `${source.baseUrl}/album_detail/${albumId}`
  const albumInfo = await fetchJson(`${source.albumBaseUrl}/r.s?stype=albuminfo&albumid=${encodeURIComponent(albumId)}&mobi=1&pn=0&vipver=MUSIC_8.2.0.0_BCS17&sortby=3&rn=1`, {
    headers: { referer: detailUrl }
  })
  const chapterCount = numberValue(albumInfo.mcnum || payload.chapterCount || albumInfo.musiclist?.length, 2000)
  const rn = Math.max(1, Math.min(chapterCount || 2000, 3000))
  const data = await fetchJson(`${source.albumBaseUrl}/r.s?stype=albuminfo&albumid=${encodeURIComponent(albumId)}&mobi=1&pn=0&vipver=MUSIC_8.2.0.0_BCS17&sortby=3&rn=${rn}`, {
    headers: { referer: detailUrl }
  })
  const musiclist = Array.isArray(data.musiclist) ? data.musiclist : []
  const chapters = musiclist.map((item, index) => {
    const musicrid = String(item.musicrid || item.id || '').replace(/^MUSIC_/i, '')
    return {
      fileId: sourceFileId({ sourceId: source.id, albumId, musicrid }),
      name: item.name || item.songname || `Chapter ${index + 1}`,
      size: 0,
      updatedAt: null,
      sourcePageUrl: detailUrl,
      duration: numberValue(item.duration)
    }
  }).filter((chapter) => chapter.fileId)

  return {
    id: sourceBookId(source, detailUrl),
    title: data.name || albumInfo.name || payload.title || '',
    author: '',
    narrator: data.artist || albumInfo.artist || payload.narrator || '',
    sourceId: source.id,
    sourceName: source.name,
    detailUrl,
    coverUrl: data.img || albumInfo.pic || payload.coverUrl || '',
    chapterCount: numberValue(data.mcnum || albumInfo.mcnum || chapters.length, chapters.length),
    chapters
  }
}

async function resolveLanrenBook(payload = {}) {
  const source = SOURCES.lanren
  const bookId = String(payload.bookId || payload.detailUrl?.match(/(\d+)(?:\D*)$/)?.[1] || '').trim()
  if (!bookId) throw new AppError('Missing LanRen book id.', 400)

  const detailUrl = `${source.baseUrl}/book/${bookId}`
  const pageSize = 50
  const firstPage = await fetchJson(`${source.baseUrl}/ajax/getBookMenu?bookId=${encodeURIComponent(bookId)}&pageNum=1&pageSize=${pageSize}&sortType=0`, {
    headers: { referer: detailUrl }
  })
  const total = numberValue(firstPage.sections || payload.chapterCount || firstPage.list?.length, 0)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const pages = [firstPage]
  for (let page = 2; page <= pageCount; page += 1) {
    pages.push(await fetchJson(`${source.baseUrl}/ajax/getBookMenu?bookId=${encodeURIComponent(bookId)}&pageNum=${page}&pageSize=${pageSize}&sortType=0`, {
      headers: { referer: detailUrl }
    }))
  }

  const chapters = pages.flatMap((pageData) => Array.isArray(pageData.list) ? pageData.list : []).filter((item) => numberValue(item.payType, 1) === 0).map((item) => {
    const section = numberValue(item.section)
    return {
      fileId: sourceFileId({ sourceId: source.id, bookId, section }),
      name: item.name || `Chapter ${section}`,
      size: numberValue(item.size),
      updatedAt: item.lastModify ? new Date(numberValue(item.lastModify)).toISOString() : null,
      sourcePageUrl: detailUrl,
      duration: numberValue(item.length)
    }
  }).filter((chapter) => chapter.fileId)

  return {
    id: sourceBookId(source, detailUrl),
    title: payload.title || '',
    author: payload.author || '',
    narrator: payload.narrator || '',
    sourceId: source.id,
    sourceName: source.name,
    detailUrl,
    coverUrl: payload.coverUrl || '',
    chapterCount: chapters.length,
    chapters
  }
}

async function resolveBokanBook(payload = {}) {
  const source = SOURCES.bokan
  const albumId = String(payload.albumId || payload.detailUrl?.match(/(\d+)(?:\D*)$/)?.[1] || '').trim()
  if (!albumId) throw new AppError('Missing BoKan album id.', 400)

  const detailUrl = `${source.baseUrl}/${albumId}`
  const pageSize = 200
  const firstPage = await fetchJson(`${source.apiBaseUrl}/voice/album/units?album_id=${encodeURIComponent(albumId)}&page=1&num=${pageSize}&order=1`, {
    headers: { referer: `${source.baseUrl}/` }
  })
  const firstData = firstPage.data || {}
  const pageCount = Math.max(1, numberValue(firstData.last_page, 1))
  const pages = [firstPage]
  for (let page = 2; page <= pageCount; page += 1) {
    pages.push(await fetchJson(`${source.apiBaseUrl}/voice/album/units?album_id=${encodeURIComponent(albumId)}&page=${page}&num=${pageSize}&order=1`, {
      headers: { referer: `${source.baseUrl}/` }
    }))
  }

  const chapters = pages.flatMap((pageData) => Array.isArray(pageData?.data?.list) ? pageData.data.list : []).map((item) => ({
    fileId: sourceFileId({ sourceId: source.id, albumId, audioUrl: item.file }),
    name: item.title || `Chapter ${item.id || ''}`.trim(),
    size: numberValue(item.size) * 1024,
    updatedAt: item.updated_at || null,
    sourcePageUrl: detailUrl,
    duration: numberValue(item.duration)
  })).filter((chapter) => chapter.fileId)

  return {
    id: sourceBookId(source, detailUrl),
    title: payload.title || '',
    author: payload.author || '',
    narrator: payload.narrator || '',
    sourceId: source.id,
    sourceName: source.name,
    detailUrl,
    coverUrl: payload.coverUrl || '',
    chapterCount: chapters.length,
    chapters
  }
}

async function resolveYuntuBook(payload = {}) {
  const source = SOURCES.yuntu
  const bookId = String(payload.bookId || payload.detailUrl?.match(/(\d+)(?:\D*)$/)?.[1] || '').trim()
  if (!bookId) throw new AppError('Missing YunTu book id.', 400)

  const detailUrl = `${source.baseUrl}/book/${bookId}`
  const pageSize = 200
  const firstPage = await fetchJson(`${source.apiBaseUrl}/api/w_ys/book/getChapters/wechat:${source.wechatId}/${encodeURIComponent(bookId)}/true/asc?pageSize=${pageSize}&pageNum=1`, {
    headers: { referer: `${source.baseUrl}/` }
  })
  const pageQuery = firstPage?.data?.pageQuery || {}
  const pageCount = Math.max(1, numberValue(pageQuery.totalPage, 1))
  const pages = [firstPage]
  for (let page = 2; page <= pageCount; page += 1) {
    pages.push(await fetchJson(`${source.apiBaseUrl}/api/w_ys/book/getChapters/wechat:${source.wechatId}/${encodeURIComponent(bookId)}/true/asc?pageSize=${pageSize}&pageNum=${page}`, {
      headers: { referer: `${source.baseUrl}/` }
    }))
  }

  const chapters = pages.flatMap((pageData) => Array.isArray(pageData?.data?.pageQuery?.list) ? pageData.data.pageQuery.list : []).map((item) => ({
    fileId: sourceFileId({ sourceId: source.id, bookId, audioUrl: item.audioUrl }),
    name: item.name || `Chapter ${item.rank || item.chapterid || ''}`.trim(),
    size: numberValue(item.audioVolume),
    updatedAt: item.createdAt || null,
    sourcePageUrl: detailUrl,
    duration: numberValue(item.audioDuration)
  })).filter((chapter) => chapter.fileId)

  return {
    id: sourceBookId(source, detailUrl),
    title: payload.title || '',
    author: payload.author || '',
    narrator: payload.narrator || '',
    sourceId: source.id,
    sourceName: source.name,
    detailUrl,
    coverUrl: payload.coverUrl || '',
    chapterCount: chapters.length,
    chapters
  }
}

export async function resolveSourceBook(payload = {}) {
  if (payload.sourceId === SOURCES.bilibili.id) {
    const book = await resolveBilibiliBook(payload)
    if (!book.title || !book.chapters.length) {
      throw new AppError('No playable BiliBili chapters found.', 502)
    }
    return book
  }

  if (payload.sourceId === SOURCES.kuwo.id) {
    const book = await resolveKuwoBook(payload)
    if (!book.title || !book.chapters.length) throw new AppError('No playable KuWo chapters found.', 502)
    return book
  }

  if (payload.sourceId === SOURCES.lanren.id) {
    const book = await resolveLanrenBook(payload)
    if (!book.title || !book.chapters.length) throw new AppError('No free playable LanRen chapters found.', 502)
    return book
  }

  if (payload.sourceId === SOURCES.bokan.id) {
    const book = await resolveBokanBook(payload)
    if (!book.title || !book.chapters.length) throw new AppError('No playable BoKan chapters found.', 502)
    return book
  }

  if (payload.sourceId === SOURCES.yuntu.id) {
    const book = await resolveYuntuBook(payload)
    if (!book.title || !book.chapters.length) throw new AppError('No playable YunTu chapters found.', 502)
    return book
  }

  if (payload.sourceId !== SOURCES.ting15.id || !payload.detailUrl) {
    throw new AppError('Unsupported source.', 400)
  }

  const html = await fetchText(payload.detailUrl, { headers: { referer: `${SOURCES.ting15.baseUrl}/` } })
  const book = parseTing15Book(html, payload.detailUrl)
  if (!book.title || !book.chapters.length) {
    throw new AppError('No playable chapters found.', 502)
  }
  return book
}

export async function resolveSourceAudio(fileId) {
  const payload = sourcePayloadFromFileId(fileId)
  if (payload.sourceId === SOURCES.bilibili.id) {
    return resolveBilibiliAudio(payload)
  }

  if (payload.sourceId === SOURCES.kuwo.id) {
    return resolveKuwoAudio(payload)
  }

  if (payload.sourceId === SOURCES.lanren.id) {
    return resolveLanrenAudio(payload)
  }

  if (payload.sourceId === SOURCES.bokan.id) {
    return resolveDirectSourceAudio(payload.audioUrl, SOURCES.bokan.baseUrl)
  }

  if (payload.sourceId === SOURCES.yuntu.id) {
    return resolveDirectSourceAudio(payload.audioUrl, SOURCES.yuntu.baseUrl)
  }

  if (payload.sourceId !== SOURCES.ting15.id || !payload.pageUrl) {
    throw new AppError('Unsupported source chapter.', 400)
  }

  const pageHtml = await fetchText(payload.pageUrl, { headers: { referer: `${SOURCES.ting15.baseUrl}/` } })
  const bookId = metaContent(pageHtml, '_b')
  const isPay = metaContent(pageHtml, '_p')
  const page = metaContent(pageHtml, '_cp')
  const token = metaContent(pageHtml, '_c')

  if (!bookId || !page || !token) throw new AppError('Source playback parameters are incomplete.', 502)

  const response = await fetch(`${SOURCES.ting15.baseUrl}/?s=api-getneoplay`, {
    method: 'POST',
    headers: {
      ...REQUEST_HEADERS,
      'content-type': 'application/x-www-form-urlencoded',
      referer: payload.pageUrl,
      xt: token
    },
    body: new URLSearchParams({ bookId, isPay, page })
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new AppError(`Source playback request failed: ${response.status}`, response.status)
  if (data.status === -1) throw new AppError('This chapter requires purchase on the source site.', 403)
  if (data.status === -2) throw new AppError('The source site is rate limiting requests.', 429)

  const url = data.ourl || data.url
  if (!url) throw new AppError('Source did not return an audio url.', 502)

  return {
    url: decodeEntities(url),
    headers: {
      referer: payload.pageUrl,
      'user-agent': REQUEST_HEADERS['user-agent']
    }
  }
}

function resolveDirectSourceAudio(url, referer) {
  if (!url || !/^https?:\/\//i.test(url)) throw new AppError('Source did not return an audio url.', 502)
  return {
    url: decodeEntities(url),
    headers: {
      referer,
      'user-agent': REQUEST_HEADERS['user-agent']
    }
  }
}

async function resolveBilibiliAudio(payload = {}) {
  const bvid = String(payload.bvid || '').trim() || bilibiliBvidFromUrl(payload.pageUrl)
  const cid = String(payload.cid || '').trim()
  if (!bvid || !cid) throw new AppError('Missing BiliBili playback parameters.', 400)

  const referer = `https://www.bilibili.com/video/${bvid}`
  const url = `${SOURCES.bilibili.apiBaseUrl}/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(cid)}&qn=64&fnval=16&fourk=0`
  const data = await fetchJson(url, { headers: { referer } })
  if (data.code !== 0) throw new AppError(data.message || 'BiliBili playback request failed.', 502)

  const audios = Array.isArray(data.data?.dash?.audio) ? data.data.dash.audio : []
  const audio = audios.sort((a, b) => Number(b.bandwidth || b.id || 0) - Number(a.bandwidth || a.id || 0))[0]
  const audioUrl = audio?.baseUrl || audio?.base_url || data.data?.durl?.[0]?.url
  if (!audioUrl) throw new AppError('BiliBili did not return an audio url.', 502)

  return {
    url: decodeEntities(audioUrl),
    contentType: 'audio/mp4',
    headers: {
      referer,
      'user-agent': REQUEST_HEADERS['user-agent']
    }
  }
}

async function resolveKuwoAudio(payload = {}) {
  const musicrid = String(payload.musicrid || '').replace(/^MUSIC_/i, '').trim()
  if (!musicrid) throw new AppError('Missing KuWo music id.', 400)

  const source = SOURCES.kuwo
  const url = `${source.audioBaseUrl}/anti.s?rid=MUSIC_${encodeURIComponent(musicrid)}&response=json&format=aac%7Cmp3&type=convert_url3&agent=miniprogram`
  const data = await fetchJson(url, { headers: { referer: `${source.baseUrl}/` } })
  const audioUrl = data.url || data.data?.url
  if (!audioUrl) throw new AppError(data.msg || 'KuWo did not return an audio url.', 502)

  return {
    url: decodeEntities(audioUrl),
    headers: {
      referer: `${source.baseUrl}/`,
      'user-agent': REQUEST_HEADERS['user-agent']
    }
  }
}

async function resolveLanrenAudio(payload = {}) {
  const source = SOURCES.lanren
  const bookId = String(payload.bookId || '').trim()
  const section = numberValue(payload.section)
  if (!bookId || !section) throw new AppError('Missing LanRen playback parameters.', 400)

  const url = `${source.baseUrl}/ajax/getPlayPath?entityId=${encodeURIComponent(bookId)}&entityType=3&opType=1&sections=[${section}]&type=0`
  const data = await fetchJson(url, { headers: { referer: `${source.baseUrl}/book/${bookId}` } })
  const audioUrl = data?.list?.[0]?.path
  if (!audioUrl) throw new AppError(data.msg || 'LanRen did not return a free audio url.', 403)

  return {
    url: decodeEntities(audioUrl),
    contentType: 'audio/mp4',
    headers: {
      referer: `${source.baseUrl}/book/${bookId}`,
      'user-agent': REQUEST_HEADERS['user-agent']
    }
  }
}
