import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: lgId } = await params
  const { content } = await req.json()
  if (!content?.trim()) return Response.json({ error: 'Content required' }, { status: 400 })
  const db = genxDb()
  const { data, error } = await db.from('admin_lg_notes').insert({
    lg_id: lgId,
    content: content.trim(),
  }).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  // Also log to timeline
  await db.from('admin_lg_timeline').insert({
    lg_id: lgId,
    event_type: 'note',
    description: content.trim().slice(0, 200),
  })
  return Response.json({ note: data })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: lgId } = await params
  const { data } = await genxDb()
    .from('admin_lg_notes')
    .select('*')
    .eq('lg_id', lgId)
    .order('created_at', { ascending: false })
  return Response.json({ notes: data || [] })
}
