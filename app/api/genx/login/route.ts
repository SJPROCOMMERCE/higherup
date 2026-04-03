import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { signSession, getSessionCookieOptions, SESSION_COOKIE } from '@/lib/genx-auth'

export async function POST(request: Request) {
  const { login_code } = await request.json() as { login_code?: string }
  if (!login_code) return Response.json({ error: 'Code required' }, { status: 400 })

  const { data: lg } = await supabase
    .from('lead_generators')
    .select('id, status, display_name')
    .eq('login_code', login_code.trim().toUpperCase())
    .single()

  if (!lg) return Response.json({ error: 'Invalid code' }, { status: 401 })

  if (lg.status === 'deactivated') {
    return Response.json({ error: 'This account has been deactivated.' }, { status: 403 })
  }

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, signSession(lg.id as string), getSessionCookieOptions())

  return Response.json({ ok: true, redirect: lg.status === 'pending' ? '/genx/welcome' : '/genx/command' })
}
