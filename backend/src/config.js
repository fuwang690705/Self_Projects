import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'

dotenv.config()

const DATA_DIR = process.env.APP_DATA_DIR || path.resolve(process.cwd(), 'data')
const CONFIG_FILE = process.env.APP_CONFIG_FILE || path.join(DATA_DIR, 'aliyun-config.json')

const DEFAULT_ALIYUN = {
  apiBase: process.env.ALIYUN_API_BASE || 'https://openapi.alipan.com',
  tokenEndpoint: process.env.ALIYUN_TOKEN_ENDPOINT || '',
  clientId: process.env.ALIYUN_CLIENT_ID || '',
  clientSecret: process.env.ALIYUN_CLIENT_SECRET || '',
  redirectUri: process.env.ALIYUN_REDIRECT_URI || '',
  scope: process.env.ALIYUN_SCOPE || 'user:base,file:all:read',
  accessToken: process.env.ALIYUN_ACCESS_TOKEN || '',
  refreshToken: process.env.ALIYUN_REFRESH_TOKEN || '',
  driveId: process.env.ALIYUN_DRIVE_ID || '',
  rootFileId: process.env.ALIYUN_ROOT_FILE_ID || 'root',
  bookTitle: process.env.ALIYUN_BOOK_TITLE || '我的听书'
}

const DEFAULT_WEBDAV = {
  baseUrl: process.env.WEBDAV_BASE_URL || '',
  username: process.env.WEBDAV_USERNAME || '',
  password: process.env.WEBDAV_PASSWORD || '',
  rootPath: process.env.WEBDAV_ROOT_PATH || '/',
  bookTitle: process.env.WEBDAV_BOOK_TITLE || '我的听书'
}

const DEFAULT_LOCAL = {
  enabled: process.env.LOCAL_LIBRARY_ENABLED !== 'false',
  rootDir: process.env.LOCAL_LIBRARY_ROOT || path.join(DATA_DIR, 'library'),
  bookTitle: process.env.LOCAL_LIBRARY_BOOK_TITLE || '本地听书'
}

function readPersistedAliyunConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {}
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    console.warn(`读取应用授权配置失败，将继续使用环境变量：${error.message}`)
    return {}
  }
}

export const config = {
  port: Number(process.env.PORT || 3001),
  dataDir: DATA_DIR,
  configFile: CONFIG_FILE,
  aliyun: {
    ...DEFAULT_ALIYUN,
    ...readPersistedAliyunConfig()
  },
  webdav: {
    ...DEFAULT_WEBDAV,
    ...readPersistedAliyunConfig().webdav
  },
  local: {
    ...DEFAULT_LOCAL,
    ...readPersistedAliyunConfig().local
  }
}

function normalizeAliyunConfig(input = {}, { keepSecrets = true } = {}) {
  const current = keepSecrets ? config.aliyun : DEFAULT_ALIYUN
  return {
    apiBase: String(input.apiBase ?? current.apiBase ?? DEFAULT_ALIYUN.apiBase).trim() || DEFAULT_ALIYUN.apiBase,
    tokenEndpoint: String(input.tokenEndpoint ?? current.tokenEndpoint ?? '').trim(),
    clientId: String(input.clientId ?? current.clientId ?? '').trim(),
    clientSecret: String(input.clientSecret ?? current.clientSecret ?? '').trim(),
    redirectUri: String(input.redirectUri ?? current.redirectUri ?? '').trim(),
    scope: String(input.scope ?? current.scope ?? DEFAULT_ALIYUN.scope).trim() || DEFAULT_ALIYUN.scope,
    accessToken: String(input.accessToken ?? current.accessToken ?? '').trim(),
    refreshToken: String(input.refreshToken ?? current.refreshToken ?? '').trim(),
    driveId: String(input.driveId ?? current.driveId ?? '').trim(),
    rootFileId: String(input.rootFileId ?? current.rootFileId ?? 'root').trim() || 'root',
    bookTitle: String(input.bookTitle ?? current.bookTitle ?? '我的听书').trim() || '我的听书'
  }
}

function normalizeWebdavConfig(input = {}, { keepSecrets = true } = {}) {
  const current = keepSecrets ? config.webdav : DEFAULT_WEBDAV
  return {
    baseUrl: String(input.baseUrl ?? current.baseUrl ?? '').trim(),
    username: String(input.username ?? current.username ?? '').trim(),
    password: String(input.password ?? current.password ?? '').trim(),
    rootPath: String(input.rootPath ?? current.rootPath ?? '/').trim() || '/',
    bookTitle: String(input.bookTitle ?? current.bookTitle ?? '我的听书').trim() || '我的听书'
  }
}

function persistedPayload() {
  return {
    ...config.aliyun,
    webdav: { ...config.webdav },
    local: { ...config.local }
  }
}

export function isAliyunConfigured() {
  return Boolean(config.aliyun.accessToken && config.aliyun.driveId)
}

export function isWebdavConfigured() {
  return Boolean(config.webdav.baseUrl && config.webdav.username && config.webdav.password)
}

export function isLocalConfigured() {
  return Boolean(config.local.enabled && config.local.rootDir)
}

export function getAliyunPublicConfig() {
  const localReady = isLocalConfigured()
  const aliyunReady = isAliyunConfigured()
  const webdavReady = isWebdavConfigured()

  return {
    apiBase: config.aliyun.apiBase,
    tokenEndpoint: config.aliyun.tokenEndpoint,
    clientId: config.aliyun.clientId,
    redirectUri: config.aliyun.redirectUri,
    scope: config.aliyun.scope,
    driveId: config.aliyun.driveId,
    rootFileId: config.aliyun.rootFileId,
    bookTitle: config.aliyun.bookTitle,
    hasAccessToken: Boolean(config.aliyun.accessToken),
    hasRefreshToken: Boolean(config.aliyun.refreshToken),
    hasClientSecret: Boolean(config.aliyun.clientSecret),
    configured: localReady || aliyunReady || webdavReady,
    sourceType: localReady ? 'local' : aliyunReady ? 'aliyun' : webdavReady ? 'webdav' : 'none',
    local: {
      enabled: Boolean(config.local.enabled),
      rootDir: config.local.rootDir,
      bookTitle: config.local.bookTitle
    },
    webdav: {
      baseUrl: config.webdav.baseUrl,
      username: config.webdav.username,
      rootPath: config.webdav.rootPath,
      bookTitle: config.webdav.bookTitle,
      hasPassword: Boolean(config.webdav.password)
    }
  }
}

export function updateAliyunConfig(input = {}, options = {}) {
  const nextAliyun = normalizeAliyunConfig(input, { keepSecrets: options.keepSecrets !== false })
  const nextWebdav = normalizeWebdavConfig(input.webdav ?? input, { keepSecrets: options.keepSecrets !== false })
  const nextLocal = {
    enabled: input.local?.enabled ?? input.localEnabled ?? config.local.enabled ?? DEFAULT_LOCAL.enabled,
    rootDir: String(input.local?.rootDir ?? input.localRootDir ?? config.local.rootDir ?? DEFAULT_LOCAL.rootDir).trim() || DEFAULT_LOCAL.rootDir,
    bookTitle: String(input.local?.bookTitle ?? input.localBookTitle ?? config.local.bookTitle ?? DEFAULT_LOCAL.bookTitle).trim() || DEFAULT_LOCAL.bookTitle
  }
  config.aliyun = nextAliyun
  config.webdav = nextWebdav
  config.local = nextLocal

  if (options.persist !== false) {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
    fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(persistedPayload(), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  }

  return getAliyunPublicConfig()
}
