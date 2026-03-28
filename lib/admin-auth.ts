import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function validateAdminSession(): Promise<boolean> {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')?.value
  if (!session) return false

  const sessionSecret = process.env.ADMIN_SESSION_SECRET
  if (!sessionSecret) return false

  const parts = session.split(':')
  if (parts.length !== 3) return false

  const [token, expiryStr, signature] = parts
  const expiry = parseInt(expiryStr)
  if (isNaN(expiry) || Date.now() > expiry) return false

  const payload = `${token}:${expiryStr}`
  const expected = crypto
    .createHmac('sha256', sessionSecret)
    .update(payload)
    .digest('hex')

  // Timing-safe compare
  try {
    if (expected.length !== signature.length) return false
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
