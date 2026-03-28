import { cookies } from 'next/headers'
import crypto from 'crypto'
import { NextRequest } from 'next/server'

// In-memory rate limiter: max 5 attempts per IP per 15 min
const attempts = new Map<string, { count: number; resetAt: number }>()

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const now = Date.now()

  // Rate limit check
  const rec = attempts.get(ip)
  if (rec && now < rec.resetAt) {
    if (rec.count >= 5) {
      return Response.json(
        { error: 'Too many attempts. Try again in 15 minutes.' },
        { status: 429 }
      )
    }
    rec.count++
  } else {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 })
  }

  const body = await request.json() as { username?: string; password?: string }
  const { username = '', password = '' } = body

  const validUsername = process.env.ADMIN_USERNAME
  const validPassword = process.env.ADMIN_PASSWORD
  const sessionSecret = process.env.ADMIN_SESSION_SECRET

  if (!validUsername || !validPassword || !sessionSecret) {
    return Response.json({ error: 'Admin not configured' }, { status: 500 })
  }

  if (username !== validUsername || password !== validPassword) {
    return Response.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // Success — reset rate limit
  attempts.delete(ip)

  // Build signed session cookie
  const token   = crypto.randomBytes(32).toString('hex')
  const expiry  = now + 24 * 60 * 60 * 1000
  const payload = `${token}:${expiry}`
  const sig     = crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex')
  const value   = `${payload}:${sig}`

  const cookieStore = await cookies()
  cookieStore.set('admin_session', value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60,
    path: '/',
  })

  return Response.json({ success: true })
}
