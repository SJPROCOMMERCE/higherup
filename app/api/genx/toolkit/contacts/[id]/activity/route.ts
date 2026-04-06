import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'
import { NextRequest } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const db = genxDb()
  const { data, error } = await db
    .from('lg_contact_activities')
    .select('*')
    .eq('contact_id', id)
    .eq('lg_id', session.lgId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ activities: data || [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { activity_type, note, script_used } = body

  if (!activity_type) {
    return Response.json({ error: 'activity_type is required' }, { status: 400 })
  }

  const db = genxDb()
  const now = new Date().toISOString()

  // Verify ownership
  const { data: contact } = await db
    .from('lg_contacts')
    .select('id, lg_id')
    .eq('id', id)
    .eq('lg_id', session.lgId)
    .single()

  if (!contact) return Response.json({ error: 'Not found' }, { status: 404 })

  const { data: activity, error } = await db
    .from('lg_contact_activities')
    .insert({
      contact_id: id,
      lg_id: session.lgId,
      activity_type,
      note: note || null,
      script_used: script_used || null,
    })
    .select('*')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Update contact's last_contacted_at
  await db
    .from('lg_contacts')
    .update({ last_contacted_at: now, updated_at: now })
    .eq('id', id)

  return Response.json({ activity })
}
