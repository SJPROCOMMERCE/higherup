import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: contactId } = await params
  const body = await req.json()
  const { activity_type, note, script_used } = body

  if (!activity_type?.trim()) {
    return Response.json({ error: 'activity_type is required' }, { status: 400 })
  }

  const db = genxDb()

  // Verify contact belongs to this LG
  const { data: contact } = await db
    .from('lg_contacts')
    .select('id')
    .eq('id', contactId)
    .eq('lg_id', session.lgId)
    .single()

  if (!contact) return Response.json({ error: 'Contact not found' }, { status: 404 })

  const { data, error } = await db
    .from('lg_contact_activities')
    .insert({
      contact_id: contactId,
      lg_id: session.lgId,
      activity_type: activity_type.trim(),
      note: note || null,
      script_used: script_used || null,
    })
    .select()
    .single()

  if (error) {
    console.error('[genx/toolkit/contacts/activity] POST error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Update contact's last_contacted_at
  await db
    .from('lg_contacts')
    .update({ last_contacted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', contactId)

  return Response.json({ activity: data })
}
