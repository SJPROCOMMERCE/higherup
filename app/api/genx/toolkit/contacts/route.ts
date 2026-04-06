import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'
import { NextRequest } from 'next/server'

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function autoFollowupAt(status: string): string | null {
  switch (status) {
    case 'contacted':  return addDays(3)
    case 'interested': return addDays(1)
    case 'link_sent':  return addDays(2)
    default: return null
  }
}

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = genxDb()
  const now = new Date().toISOString()

  const { data, error } = await db
    .from('lg_contacts')
    .select('*')
    .eq('lg_id', session.lgId)
    .eq('is_archived', false)
    .order('is_starred', { ascending: false })
    .order('next_followup_at', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })

  if (error) {
    if (error.message?.includes('does not exist')) {
      return Response.json({ contacts: [], migration_needed: true })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  const contacts = (data || []).map(c => ({
    ...c,
    overdue: c.next_followup_at
      && c.next_followup_at < now
      && !['signed_up', 'activated', 'lost'].includes(c.status),
  }))

  return Response.json({ contacts })
}

export async function POST(req: NextRequest) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, channel, handle, source, notes, status = 'prospect' } = body

  if (!name?.trim() || !channel?.trim()) {
    return Response.json({ error: 'name and channel are required' }, { status: 400 })
  }

  const db = genxDb()
  const now = new Date().toISOString()
  const followupAt = autoFollowupAt(status)

  const { data: contact, error: insertError } = await db
    .from('lg_contacts')
    .insert({
      lg_id: session.lgId,
      name: name.trim(),
      channel,
      handle: handle?.trim() || null,
      source: source?.trim() || null,
      notes: notes?.trim() || null,
      status,
      next_followup_at: followupAt,
      first_contacted_at: status !== 'prospect' ? now : null,
      last_contacted_at: status !== 'prospect' ? now : null,
    })
    .select('*')
    .single()

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 })
  }

  // Create first activity
  if (contact) {
    await db.from('lg_contact_activities').insert({
      contact_id: contact.id,
      lg_id: session.lgId,
      activity_type: status === 'prospect' ? 'note' : 'first_dm',
      note: notes?.trim() || `Contact added with status: ${status}`,
    })
  }

  return Response.json({ contact })
}
