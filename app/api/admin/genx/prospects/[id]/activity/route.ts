import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const db = genxDb()
  const { data, error } = await db.from('admin_prospect_activities').insert({
    prospect_id: id,
    activity_type: body.activity_type,
    description: body.description || null,
  }).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Update prospect's updated_at
  await db.from('admin_prospects').update({ updated_at: new Date().toISOString() }).eq('id', id)

  return Response.json({ activity: data })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { data } = await genxDb()
    .from('admin_prospect_activities')
    .select('*')
    .eq('prospect_id', id)
    .order('created_at', { ascending: false })
  return Response.json({ activities: data || [] })
}
