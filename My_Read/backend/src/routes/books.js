import { Router } from 'express'
import { listAudioBook } from '../aliyunClient.js'
import { listSubscribedBooks } from '../subscriptionStore.js'

const router = Router()

router.get('/books', async (req, res, next) => {
  try {
    const books = await listAudioBook()
    const subscribed = listSubscribedBooks()
    if (subscribed.length) {
      const sourceBooks = subscribed
        .filter((item) => Array.isArray(item.chapters) && item.chapters.length)
        .map((item) => ({
          id: item.id,
          title: item.title,
          author: item.author || item.narrator || item.sourceName || '',
          coverUrl: item.coverUrl || '',
          rootFileId: item.detailUrl || item.id,
          chapters: item.chapters
        }))
      const legacyChapters = subscribed
        .filter((item) => item.audioUrl)
        .map((item) => ({
          fileId: `remote:${Buffer.from(item.audioUrl, 'utf8').toString('base64url')}`,
          name: item.title,
          size: 0,
          updatedAt: null
        }))

      books.push(...sourceBooks)
      if (legacyChapters.length) {
        books.push({
          id: 'subscription-book',
          title: '订阅源',
          rootFileId: 'subscription',
          chapters: legacyChapters
        })
      }
    }
    res.json({ books })
  } catch (error) {
    next(error)
  }
})

export default router
