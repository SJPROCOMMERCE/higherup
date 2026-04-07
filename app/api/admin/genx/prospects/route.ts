import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function GET() {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await genxDb()
    .from('admin_prospects')
    .select('*')
    .order('updated_at', { ascending: false })
  return Response.json({ prospects: data || [] })
}

export async function POST(req: Request) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const db = genxDb()
  const now = new Date().toISOString()
  const { data, error } = await db.from('admin_prospects').insert({
    name: body.name,
    email: body.email || null,
    phone: body.phone || null,
    platform: body.platform || null,
    handle: body.handle || null,
    source: body.source || 'manual',
    community_id: body.community_id || null,
    stage: 'identified',
    identified_at: now,
    priority: body.priority || 'normal',
    notes: body.notes || null,
    tags: body.tags || [],
  }).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  await db.from('admin_prospect_activities').insert({
    prospect_id: data.id,
    activity_type: 'status_change',
    description: 'Prospect added to pipeline',
    new_stage: 'identified',
  })
  return Response.json({ prospect: data })
}
