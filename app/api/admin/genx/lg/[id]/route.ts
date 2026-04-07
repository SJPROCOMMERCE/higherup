import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const db = genxDb()
  const [lgRes, checklistRes, notesRes, timelineRes, referralsRes] = await Promise.all([
    db.from('lead_generators').select('*').eq('id', id).single(),
    db.from('admin_lg_checklist').select('*').eq('lg_id', id).order('sort_order'),
    db.from('admin_lg_notes').select('*').eq('lg_id', id).order('created_at', { ascending: false }),
    db.from('admin_lg_timeline').select('*').eq('lg_id', id).order('created_at', { ascending: false }).limit(50),
    db.from('referral_tracking').select('va_id, status, created_at').eq('lg_id', id),
  ])
  if (!lgRes.data) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({
    lg: lgRes.data,
    checklist: checklistRes.data || [],
    notes: notesRes.data || [],
    timeline: timelineRes.data || [],
    referrals: referralsRes.data || [],
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const allowed = ['onboarding_status', 'lg_tier', 'community_id', 'recruiter_notes', 'display_name', 'email']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key]
  }
  await genxDb().from('lead_generators').update(update).eq('id', id)
  return Response.json({ ok: true })
}
