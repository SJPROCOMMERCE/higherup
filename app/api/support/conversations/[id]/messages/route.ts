import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// ─── POST: Send a message ──────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params
  const body = await req.json()
  const { sender_id, sender_role, message, message_type, attachment_url, attachment_name } = body

  if (!sender_id || !sender_role || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (message.length < 1 || message.length > 2000) {
    return NextResponse.json({ error: 'Message must be 1–2000 characters' }, { status: 400 })
  }

  // ── Rate limit: max 20 messages per hour per sender ──────────────────
  if (sender_role === 'va') {
    const { count } = await supabase
      .from('support_messages')
      .select('*', { count: 'exact', head: true })
      .eq('sender_id', sender_id)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

    if ((count ?? 0) >= 20) {
      return NextResponse.json({
        error: 'Message limit reached. Please wait before sending more messages.',
      }, { status: 429 })
    }
  }

  // ── Verify conversation exists and is not closed ──────────────────────
  const { data: conv, error: convErr } = await supabase
    .from('support_conversations')
    .select('status')
    .eq('id', conversationId)
    .single()

  if (convErr || !conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }
  if (conv.status === 'closed') {
    return NextResponse.json({ error: 'Conversation is closed' }, { status: 403 })
  }

  // ── Insert message ────────────────────────────────────────────────────
  const { data, error } = await supabase
    .from('support_messages')
    .insert({
      conversation_id: conversationId,
      sender_id,
      sender_role,
      message:         message.trim(),
      message_type:    message_type ?? 'text',
      attachment_url:  attachment_url ?? null,
      attachment_name: attachment_name ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
