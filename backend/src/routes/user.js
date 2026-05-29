import { Router } from 'express'
import { requireSessionUser } from '../middleware/session.js'
import { attachSession, clearSession, getSessionUser, loginUser, quickLoginUser, registerUser, updateUserProfile } from '../userStore.js'

const router = Router()

router.get('/user/session', async (req, res, next) => {
  try {
    res.json({ user: await getSessionUser(req) })
  } catch (error) {
    next(error)
  }
})

router.post('/user/register', async (req, res, next) => {
  try {
    const user = await registerUser(req.body || {})
    res.json({ user: attachSession(res, user) })
  } catch (error) {
    next(error)
  }
})

router.post('/user/login', async (req, res, next) => {
  try {
    const user = await loginUser(req.body || {})
    res.json({ user: attachSession(res, user) })
  } catch (error) {
    next(error)
  }
})

router.post('/user/quick-login', async (req, res, next) => {
  try {
    const user = await quickLoginUser()
    res.json({ user: attachSession(res, user) })
  } catch (error) {
    next(error)
  }
})

router.patch('/user/profile', async (req, res, next) => {
  try {
    const currentUser = await requireSessionUser(req)
    const user = await updateUserProfile(currentUser.id, req.body || {})
    res.json({ user })
  } catch (error) {
    next(error)
  }
})

router.post('/user/logout', (req, res) => {
  clearSession(req, res)
  res.json({ ok: true })
})

export default router
