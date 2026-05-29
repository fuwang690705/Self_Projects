import { Router } from 'express'
import { getAliyunPublicConfig, updateAliyunConfig } from '../config.js'
import { getAuthStatus } from '../aliyunClient.js'
import { requireSessionUser } from '../middleware/session.js'

const router = Router()

router.get('/auth/status', (req, res) => {
  res.json(getAuthStatus())
})

router.get('/auth/config', (req, res) => {
  res.json(getAliyunPublicConfig())
})

router.post('/auth/config', async (req, res, next) => {
  try {
    await requireSessionUser(req)
    const saved = updateAliyunConfig(req.body || {})
    res.json({ ok: true, config: saved, status: getAuthStatus() })
  } catch (error) {
    next(error)
  }
})

export default router
