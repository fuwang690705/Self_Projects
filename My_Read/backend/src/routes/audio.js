import { Router } from 'express'
import { createAudioStream, getAudioDownloadUrl } from '../aliyunClient.js'

const router = Router()

router.get('/audio-url/:fileId', async (req, res, next) => {
  try {
    const result = await getAudioDownloadUrl(req.params.fileId)
    res.json(result)
  } catch (error) {
    next(error)
  }
})

router.get('/audio-stream/:fileId', async (req, res, next) => {
  try {
    const upstream = await createAudioStream(req.params.fileId, req.headers.range)

    res.status(upstream.status)
    const passthrough = ['content-type', 'content-length', 'accept-ranges', 'content-range', 'etag', 'last-modified']
    for (const key of passthrough) {
      const value = upstream.headers.get(key)
      if (value) res.setHeader(key, value)
    }

    if (upstream.localStream) {
      upstream.localStream.on('error', (error) => next(error))
      if (upstream.cleanup) res.on('close', upstream.cleanup)
      upstream.localStream.pipe(res)
      return
    }

    if (!upstream.body) {
      res.end()
      return
    }

    const reader = upstream.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
    }
    res.end()
  } catch (error) {
    next(error)
  }
})

export default router
