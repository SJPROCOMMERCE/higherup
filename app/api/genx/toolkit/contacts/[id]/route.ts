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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const db = genxDb()
  const now = new Date().toISOString()

  // Verify ownership
  const { data: existing } = await db
    .from('lg_contacts')
    .select('id, status, lg_id')
    .eq('id', id)
    .eq('lg_id', session.lgId)
    .single()

  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })

  const updates: Record<string, unknown> = { ...body, updated_at: now }

  // Auto-update timestamps on status change
  if (body.status && body.status !== existing.status) {
    const newFollowup = autoFollowupAt(body.status)
    if (newFollowup) updates.next_followup_at = newFollowup

    if (['replied', 'interested'].includes(body.status)) {
      updates.last_replied_at = now
    }
    if (!['prospect'].includes(body.status)) {
      updates.last_contacted_at = now
      if (!existing.status || existing.status === 'prospect') {
        updates.first_contacted_at = now
      }
    }
  }

  const { data: contact, error } = await db
    .from('lg_contacts')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Log status change activity
  if (body.status && body.status !== existing.status) {
    await db.from('lg_contact_activities').insert({
      contact_id: id,
      lg_id: session.lgId,
      activity_type: 'status_change',
      note: `Status changed from ${existing.status} to ${body.status}`,
    })
  }

  return Response.json({ contact })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = genxDb()

  const { error } = await db
    .from('lg_contacts')
    .delete()
    .eq('id', id)
    .eq('lg_id', session.lgId)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
