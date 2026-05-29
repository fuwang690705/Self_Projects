import { randomBytes } from 'node:crypto'
import { URL } from 'node:url'
import { config, updateAliyunConfig } from './config.js'
import { AppError } from './errors.js'

let pendingState = null

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

function resolveOauthBase() {
  const base = config.aliyun.apiBase || 'https://openapi.alipan.com'
  return base.replace(/\/$/, '')
}

function resolveRedirectUri() {
  const configured = String(config.aliyun.redirectUri || '').trim()
  if (configured) return configured

  const appDomain = String(process.env.APP_DOMAIN || '').trim()
  if (appDomain) return `https://${appDomain}/api/aliyun/oauth/callback`

  return `http://localhost:${process.env.PORT || 3001}/api/aliyun/oauth/callback`
}

export function createOauthStartPayload() {
  if (!config.aliyun.clientId) {
    throw new AppError('缺少 Client ID，请在“我的 > 授权中心 > 高级配置”填写。', 400)
  }

  const state = base64url(randomBytes(24))
  pendingState = {
    value: state,
    createdAt: Date.now()
  }

  const authorizeUrl = new URL('/v2/oauth/authorize', resolveOauthBase())
  authorizeUrl.searchParams.set('client_id', config.aliyun.clientId)
  authorizeUrl.searchParams.set('redirect_uri', resolveRedirectUri())
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('scope', config.aliyun.scope || 'user:base,file:all:read')
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('login_type', 'default')

  return {
    authorizeUrl: authorizeUrl.toString(),
    state,
    redirectUri: resolveRedirectUri()
  }
}

export async function exchangeCodeForToken({ code, state }) {
  if (!code) throw new AppError('缺少授权码 code。', 400)
  if (!pendingState || pendingState.value !== state) {
    throw new AppError('授权状态已过期，请重新发起授权。', 400)
  }

  const tokenUrl = new URL('/v2/oauth/token', resolveOauthBase())
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: config.aliyun.clientId,
      client_secret: config.aliyun.clientSecret || undefined,
      redirect_uri: resolveRedirectUri()
    })
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.access_token) {
    throw new AppError(payload?.message || '换取 Access Token 失败。', 502, payload)
  }

  pendingState = null

  updateAliyunConfig({
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || '',
    driveId: payload.resource_drive_id || payload.default_drive_id || payload.backup_drive_id || config.aliyun.driveId || '',
    rootFileId: config.aliyun.rootFileId || 'root'
  })

  return {
    ok: true,
    driveId: payload.resource_drive_id || payload.default_drive_id || payload.backup_drive_id || config.aliyun.driveId || '',
    hasRefreshToken: Boolean(payload.refresh_token)
  }
}
