const jsonHeaders = { Accept: 'application/json' }
const CLIENT_ID_KEY = 'my-read-client-id:v1'

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
  const response = await fetch(path, {
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
