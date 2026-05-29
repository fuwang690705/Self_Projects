import { Router } from 'express'
import { addSubscribedBook, listSources, listSubscribedBooks, previewSubscribedBook, removeSource, searchSources, upsertSource } from '../subscriptionStore.js'
import { requireSessionUser } from '../middleware/session.js'

const router = Router()

router.get('/subscriptions/sources', async (req, res, next) => {
  try {
    await requireSessionUser(req)
    res.json({ sources: await listSources() })
  } catch (error) {
    next(error)
  }
})

router.post('/subscriptions/sources', async (req, res, next) => {
  try {
    await requireSessionUser(req)
    const source = await upsertSource(req.body || {})
    res.json({ source })
  } catch (error) {
    next(error)
  }
})

router.delete('/subscriptions/sources/:id', async (req, res, next) => {
  try {
    await requireSessionUser(req)
    await removeSource(req.params.id)
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

router.get('/subscriptions/search', async (req, res, next) => {
  try {
    await requireSessionUser(req)
    const items = await searchSources(req.query.q)
    res.json({ items })
  } catch (error) {
    next(error)
  }
})

router.get('/subscriptions/books', async (req, res, next) => {
  try {
    const user = await requireSessionUser(req)
    const books = await listSubscribedBooks(user.id)
    res.json({ books })
  } catch (error) {
    next(error)
  }
})

router.post('/subscriptions/books/preview', async (req, res, next) => {
  try {
    await requireSessionUser(req)
    const item = await previewSubscribedBook(req.body || {})
    res.json({ item })
  } catch (error) {
    next(error)
  }
})

router.post('/subscriptions/books', async (req, res, next) => {
  try {
    const user = await requireSessionUser(req)
    const item = await addSubscribedBook(user.id, req.body || {})
    res.json({ item })
  } catch (error) {
    next(error)
  }
})

export default router
