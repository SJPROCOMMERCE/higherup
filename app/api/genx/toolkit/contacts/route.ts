import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = genxDb()
  const { data, error } = await db
    .from('lg_contacts')
    .select('*')
    .eq('lg_id', session.lgId)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[genx/toolkit/contacts] GET error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ contacts: data || [] })
}

export async function POST(req: Request) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, channel, handle, status, notes, source, next_followup_at } = body

  if (!name?.trim() || !channel?.trim()) {
    return Response.json({ error: 'name and channel are required' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const db = genxDb()
  const { data, error } = await db
    .from('lg_contacts')
    .insert({
      lg_id: session.lgId,
      name: name.trim(),
      channel: channel.trim(),
      handle: handle || null,
      status: status || 'prospect',
      notes: notes || null,
      source: source || null,
      next_followup_at: next_followup_at || null,
      first_contacted_at: status && status !== 'prospect' ? now : null,
      last_contacted_at: status && status !== 'prospect' ? now : null,
    })
    .select()
    .single()

  if (error) {
    console.error('[genx/toolkit/contacts] POST error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ contact: data })
}
