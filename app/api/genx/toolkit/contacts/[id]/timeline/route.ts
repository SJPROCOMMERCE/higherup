import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: contactId } = await params
  const db = genxDb()

  // Verify ownership
  const { data: contact } = await db
    .from('lg_contacts')
    .select('id')
    .eq('id', contactId)
    .eq('lg_id', session.lgId)
    .single()

  if (!contact) return Response.json({ error: 'Contact not found' }, { status: 404 })

  const { data, error } = await db
    .from('lg_contact_activities')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[genx/toolkit/contacts/timeline] GET error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ activities: data || [] })
}
