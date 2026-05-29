export class AppError extends Error {
  constructor(message, status = 500, details = undefined) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.details = details
  }
}

export function errorMiddleware(error, req, res, next) {
  if (res.headersSent) return next(error)

  const status = error.status || 500
  res.status(status).json({
    error: {
      message: error.message || '服务器内部错误',
      status,
      details: error.details
    }
  })
}
