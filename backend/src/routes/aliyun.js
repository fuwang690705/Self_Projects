import { Router } from 'express'
import { createOauthStartPayload, exchangeCodeForToken } from '../oauth.js'
import { requireSessionUser } from '../middleware/session.js'

const router = Router()

router.post('/aliyun/oauth/start', async (req, res, next) => {
  try {
    await requireSessionUser(req)
    res.json(createOauthStartPayload())
  } catch (error) {
    next(error)
  }
})

router.get('/aliyun/oauth/callback', async (req, res, next) => {
  try {
    await exchangeCodeForToken({
      code: req.query.code,
      state: req.query.state
    })

    const redirectTarget = req.hostname === 'localhost' || req.hostname === '127.0.0.1'
      ? 'http://localhost:5173/?aliyun=connected'
      : '/?aliyun=connected'

    res.type('html').send(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>阿里云盘授权完成</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f7fa; color: #172033; }
      main { width: min(88vw, 360px); padding: 28px; border-radius: 18px; background: #fff; box-shadow: 0 18px 48px rgba(20, 32, 48, 0.12); text-align: center; }
      h1 { margin: 0 0 10px; font-size: 22px; }
      p { margin: 0 0 22px; color: #697386; line-height: 1.7; }
      a { display: inline-grid; place-items: center; min-width: 160px; height: 44px; border-radius: 999px; color: #fff; background: #2f6d87; text-decoration: none; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <h1>授权完成</h1>
      <p>已经连接阿里云盘，可以回到听书应用刷新书架。</p>
      <a href="${redirectTarget}">回到应用</a>
    </main>
    <script>setTimeout(() => { location.href = ${JSON.stringify(redirectTarget)} }, 1200)</script>
  </body>
</html>`)
  } catch (error) {
    next(error)
  }
})

export default router
