import { Readable } from 'node:stream'
import { Router } from 'express'
import { AppError } from '../errors.js'

const router = Router()

const COVER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
}

function inferReferer(url) {
  const hostname = url.hostname.toLowerCase()
  if (hostname.includes('guoguo.org.cn')) return 'https://m.ting15.com/'
  if (hostname.includes('kuwo.cn') || hostname.includes('sycdn.kuwo.cn')) return 'https://kuwo.cn/'
  if (hostname.includes('lrts.me') || hostname.includes('tencentmusic.com')) return 'https://m.lrts.me/'
  if (hostname.includes('bookan.com.cn')) return 'https://voicewk.bookan.com.cn/'
  if (hostname.includes('yuntuys.com')) return 'http://yuntuwechat.yuntuys.com/'
  if (hostname.includes('hdslb.com')) return 'https://www.bilibili.com/'
  if (hostname.includes('maoercdn.com')) return 'https://www.missevan.com/'
  return `${url.protocol}//${url.hostname}/`
}

router.get('/source-cover', async (req, res, next) => {
  try {
    const rawUrl = String(req.query.url || '').trim()
    let target
    try {
      target = new URL(rawUrl)
    } catch {
      throw new AppError('封面地址无效。', 400)
    }

    if (!['http:', 'https:'].includes(target.protocol)) {
      throw new AppError('封面地址协议不支持。', 400)
    }

    const response = await fetch(target.href, {
      headers: {
        ...COVER_HEADERS,
        referer: inferReferer(target)
      }
    })

    if (!response.ok) {
      throw new AppError(`封面加载失败：${response.status}`, response.status)
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    if (!contentType.startsWith('image/')) {
      throw new AppError('封面地址没有返回图片。', 502)
    }

    res.status(response.status)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    const contentLength = response.headers.get('content-length')
    if (contentLength) res.setHeader('Content-Length', contentLength)

    Readable.fromWeb(response.body).pipe(res)
  } catch (error) {
    next(error)
  }
})

export default router
