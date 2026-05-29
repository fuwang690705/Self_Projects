const jsonHeaders = { Accept: 'application/json' }
const CLIENT_ID_KEY = 'my-read-client-id:v1'
const API_SERVER_KEY = 'my-read-api-server:v1'

export function getApiServer() {
  // 检测是否处于 Capacitor 原生 App 环境中
  const isNative = typeof window !== 'undefined' && !!window.Capacitor;
  if (isNative) {
    // 固化强制使用官方线上 API，防止 localStorage 中的旧报错配置或本地调试地址干扰
    return 'http://listen.techfone.xyz';
  }

  try {
    let saved = localStorage.getItem(API_SERVER_KEY)
    if (saved) {
      saved = saved.trim().replace(/\/$/, '')
      if (saved && !saved.startsWith('http://') && !saved.startsWith('https://')) {
        saved = `http://${saved}`
      }
      return saved
    }
  } catch {}
  
  // 浏览器环境下，若是远程访问则返回官方线上 API，否则本地开发使用相对路径
  const isWebRemote = typeof window !== 'undefined' && 
    window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
  
  return isWebRemote ? 'http://listen.techfone.xyz' : ''
}

export function saveApiServer(url) {
  try {
    if (url) {
      let cleaned = url.trim().replace(/\/$/, '')
      if (cleaned && !cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
        cleaned = `http://${cleaned}`
      }
      localStorage.setItem(API_SERVER_KEY, cleaned)
    } else {
      localStorage.removeItem(API_SERVER_KEY)
    }
  } catch {}
}

function clientId() {
  try {
    let value = localStorage.getItem(CLIENT_ID_KEY)
    if (!value) {
      value = globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
      localStorage.setItem(CLIENT_ID_KEY, value)
    }
    return value
  } catch {
    return 'anonymous'
  }
}

async function request(path, options = {}) {
  const base = getApiServer()
  const fullPath = (path.startsWith('http://') || path.startsWith('https://')) ? path : `${base}${path}`
  
  const response = await fetch(fullPath, {
    ...options,
    headers: {
      ...jsonHeaders,
      'X-My-Read-Client-Id': clientId(),
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `请求失败：${response.status}`
    const error = new Error(message)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

export function getAuthStatus() {
  return request('/api/auth/status')
}

export function getAuthConfig() {
  return request('/api/auth/config')
}

export function saveAuthConfig(config) {
  return request('/api/auth/config', {
    method: 'POST',
    body: JSON.stringify(config)
  })
}

export function startAliyunOauth() {
  return request('/api/aliyun/oauth/start', {
    method: 'POST'
  })
}

export function getUserSession() {
  return request('/api/user/session')
}

export function loginUser(payload) {
  return request('/api/user/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function registerUser(payload) {
  return request('/api/user/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function quickLogin() {
  return request('/api/user/quick-login', {
    method: 'POST'
  })
}

export function logoutUser() {
  return request('/api/user/logout', {
    method: 'POST'
  })
}

export function updateUserProfile(payload) {
  return request('/api/user/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
}

export function getBooks() {
  return request('/api/books')
}

export function getPlaybackRecords() {
  return request('/api/playback/records')
}

export function savePlaybackRecord(payload) {
  return request('/api/playback/records', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function getAudioUrl(fileId) {
  return request(`/api/audio-url/${encodeURIComponent(fileId)}`)
}

export function getSubscriptionSources() {
  return request('/api/subscriptions/sources')
}

export function saveSubscriptionSource(payload) {
  return request('/api/subscriptions/sources', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function deleteSubscriptionSource(id) {
  return request(`/api/subscriptions/sources/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
}

export function searchSubscriptionBooks(keyword) {
  return request(`/api/subscriptions/search?q=${encodeURIComponent(keyword)}`)
}

export function getSubscribedBooks() {
  return request('/api/subscriptions/books')
}

export function previewSubscribedBook(payload) {
  return request('/api/subscriptions/books/preview', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function addSubscribedBook(payload) {
  return request('/api/subscriptions/books', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function getLatestVersion() {
  return request('/api/app-version/latest')
}

export function releaseNewVersion(formData) {
  return request('/api/app-version/release', {
    method: 'POST',
    body: formData
  })
}

export function verifyAdminPasscode(passcode) {
  return request('/api/app-version/verify-passcode', {
    method: 'POST',
    body: JSON.stringify({ passcode })
  })
}
