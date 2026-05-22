import { AppError } from '../errors.js'
import { getSessionUser } from '../userStore.js'

export async function requireSessionUser(req) {
  const user = await getSessionUser(req)
  if (!user) throw new AppError('请先登录账号。', 401)
  return user
}
