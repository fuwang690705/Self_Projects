import { Router } from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import multer from 'multer'
import { config } from '../config.js'
import { AppError } from '../errors.js'
import { getLatestVersion, saveVersion } from '../versionStore.js'

const router = Router()

// Configure storage for apk upload
const uploadDir = path.join(config.dataDir, 'uploads', 'apks')
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(uploadDir, { recursive: true })
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.apk'
    // Unique file name using version and timestamp
    const name = `my-read-${req.body.versionName || 'update'}-${Date.now()}${ext}`
    cb(null, name)
  }
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Only accept apk files
    if (path.extname(file.originalname).toLowerCase() !== '.apk') {
      return cb(new AppError('只能上传 APK 文件。', 400), false)
    }
    cb(null, true)
  },
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max limit for APK
  }
})

// GET /api/app-version/latest
router.get('/app-version/latest', async (req, res, next) => {
  try {
    const latest = await getLatestVersion()
    res.json({ latest })
  } catch (error) {
    next(error)
  }
})

// POST /api/app-version/verify-passcode
router.post('/app-version/verify-passcode', (req, res, next) => {
  try {
    const passcode = String(req.body.passcode || '').trim()
    const expectedPasscode = process.env.ADMIN_PASSCODE || 'admin'
    if (passcode === expectedPasscode) {
      res.json({ success: true })
    } else {
      throw new AppError('管理员验证失败，密码不正确。', 401)
    }
  } catch (error) {
    next(error)
  }
})

// POST /api/app-version/release
router.post('/app-version/release', upload.single('apk'), async (req, res, next) => {
  try {
    const passcode = String(req.body.passcode || '').trim()
    const expectedPasscode = process.env.ADMIN_PASSCODE || 'admin'
    if (passcode !== expectedPasscode) {
      // If we uploaded a file but authentication failed, clean up the file
      if (req.file) {
        fs.unlinkSync(req.file.path)
      }
      throw new AppError('管理员密码错误，无法发布新版本。', 401)
    }

    const versionName = String(req.body.versionName || '').trim()
    const versionCode = Number(req.body.versionCode)
    const releaseNotes = String(req.body.releaseNotes || '').trim()
    const isForceUpdate = req.body.isForceUpdate === 'true' || req.body.isForceUpdate === true

    if (!versionName) throw new AppError('版本名称不能为空。', 400)
    if (isNaN(versionCode) || versionCode <= 0) throw new AppError('版本号必须是正整数。', 400)
    if (!releaseNotes) throw new AppError('更新内容不能为空。', 400)
    if (!req.file) throw new AppError('请选择 APK 文件上传。', 400)

    const latest = await getLatestVersion()
    if (latest && versionCode <= latest.versionCode) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path)
      throw new AppError(`新发布的版本号 (${versionCode}) 必须大于当前最新版本号 (${latest.versionCode})。`, 400)
    }

    // Generate relative APK download URL
    const relativeUrl = `/api/uploads/apks/${req.file.filename}`

    const newVersion = {
      id: randomBytes(12).toString('hex'),
      versionName,
      versionCode,
      releaseNotes,
      apkUrl: relativeUrl,
      isForceUpdate,
      createdAt: new Date().toISOString()
    }

    await saveVersion(newVersion)
    res.status(201).json({ success: true, version: newVersion })
  } catch (error) {
    next(error)
  }
})

export default router
