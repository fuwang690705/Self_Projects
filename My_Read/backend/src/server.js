import cors from 'cors'
import express from 'express'
import morgan from 'morgan'
import { errorMiddleware } from './errors.js'
import aliyunRoutes from './routes/aliyun.js'
import audioRoutes from './routes/audio.js'
import authRoutes from './routes/auth.js'
import booksRoutes from './routes/books.js'
import healthRoutes from './routes/health.js'
import playbackRoutes from './routes/playback.js'
import sourceCoverRoutes from './routes/sourceCover.js'
import subscriptionsRoutes from './routes/subscriptions.js'
import userRoutes from './routes/user.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '256kb' }))
app.use(morgan('dev'))

app.use('/api', healthRoutes)
app.use('/api', authRoutes)
app.use('/api', userRoutes)
app.use('/api', aliyunRoutes)
app.use('/api', booksRoutes)
app.use('/api', playbackRoutes)
app.use('/api', sourceCoverRoutes)
app.use('/api', subscriptionsRoutes)
app.use('/api', audioRoutes)

app.use(errorMiddleware)

app.listen(Number(process.env.PORT || 3001), () => {
  console.log(`听书后端已启动：http://localhost:${process.env.PORT || 3001}`)
})
