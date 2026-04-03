import crypto from 'crypto'
import { cookies } from 'next/headers'
import { supabase } from './supabase'

const SESSION_COOKIE = 'genx_session'
const SECRET = process.env.ADMIN_SESSION_SECRET || 'genx-fallback-secret'

export function signSession(lgId: string): string {
  const expiry  = Date.now() + 7 * 24 * 60 * 60 * 1000  // 7 days
  const payload = `${lgId}:${expiry}`
  const sig     = crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
  return `${payload}:${sig}`
}

export function verifySession(value: string): string | null {
  try {
    const lastColon = value.lastIndexOf(':')
    const payload   = value.slice(0, lastColon)
    const sig       = value.slice(lastColon + 1)
    const expected  = crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null
    const [lgId, expiry] = payload.split(':')
    if (Date.now() > Number(expiry)) return null
    return lgId
  } catch {
    return null
  }
}

export async function getGenxSession(): Promise<{ lgId: string; lg: Record<string, unknown> } | null> {
  try {
    const cookieStore = await cookies()
    const raw = cookieStore.get(SESSION_COOKIE)?.value
    if (!raw) return null
    const lgId = verifySession(raw)
    if (!lgId) return null
    const { data: lg } = await supabase
      .from('lead_generators')
      .select('*')
      .eq('id', lgId)
      .single()
    if (!lg) return null
    return { lgId, lg: lg as Record<string, unknown> }
  } catch {
    return null
  }
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  }
}

export { SESSION_COOKIE }
