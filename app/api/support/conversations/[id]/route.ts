import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// ─── GET: Conversation details + messages ──────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const [{ data: conv, error: convErr }, { data: messages, error: msgErr }] =
    await Promise.all([
      supabase.from('support_conversations').select('*').eq('id', id).single(),
      supabase
        .from('support_messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true }),
    ])

  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 404 })
  if (msgErr)  return NextResponse.json({ error: msgErr.message },  { status: 500 })

  return NextResponse.json({ conversation: conv, messages: messages ?? [] })
}

// ─── PATCH: Update status / priority / admin_id ────────────────────────────
// Used by admin: assign, close, resolve, change priority

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await req.json()

  const allowed = ['status', 'priority', 'admin_id', 'resolved_at', 'closed_at']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  // Auto-set timestamps when status changes
  if (body.status === 'resolved' && !body.resolved_at) {
    updates.resolved_at = new Date().toISOString()
  }
  if (body.status === 'closed' && !body.closed_at) {
    updates.closed_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('support_conversations')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Insert system message when resolved or closed
  if (body.status === 'resolved' || body.status === 'closed') {
    const systemMsg =
      body.status === 'resolved'
        ? 'This conversation has been marked as resolved.'
        : 'This conversation has been closed.'

    // Use the admin_id from body or existing conversation as sender
    const senderId = body.admin_id || body._admin_uid
    if (senderId) {
      await supabase.from('support_messages').insert({
        conversation_id: id,
        sender_id:       senderId,
        sender_role:     'admin',
        message:         systemMsg,
        message_type:    'system',
      })
    }
  }

  return NextResponse.json(data)
}
