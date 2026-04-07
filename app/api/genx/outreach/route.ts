import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await genxDb().from('lg_outreach').select('*').eq('lg_id', session.lgId).order('updated_at', { ascending: false })
  return Response.json({ contacts: data || [] })
}

export async function POST(req: Request) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { contact_name, contact_channel, contact_handle, notes } = body
  if (!contact_name || !contact_channel) return Response.json({ error: 'Missing required fields' }, { status: 400 })
  const { data, error } = await genxDb().from('lg_outreach').insert({
    lg_id: session.lgId, contact_name, contact_channel,
    contact_handle: contact_handle || null, notes: notes || null,
  }).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ contact: data })
}
