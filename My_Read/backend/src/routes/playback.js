import { Router } from 'express'
import { listPlaybackRecords, playbackOwnerId, savePlaybackRecord } from '../playbackStore.js'
import { getSessionUser } from '../userStore.js'

const router = Router()

router.get('/playback/records', async (req, res, next) => {
  try {
    const user = await getSessionUser(req)
    const ownerId = playbackOwnerId(user, req.headers['x-my-read-client-id'])
    res.json({ records: listPlaybackRecords(ownerId) })
  } catch (error) {
    next(error)
  }
})

router.post('/playback/records', async (req, res, next) => {
  try {
    const user = await getSessionUser(req)
    const ownerId = playbackOwnerId(user, req.headers['x-my-read-client-id'])
    const record = savePlaybackRecord(ownerId, req.body || {})
    res.json({ ok: true, record })
  } catch (error) {
    next(error)
  }
})

export default router
