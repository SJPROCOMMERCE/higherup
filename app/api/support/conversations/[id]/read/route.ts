import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// ─── POST: Mark conversation as read ──────────────────────────────────────
// role: 'va' resets unread_va to 0, marks admin messages as read
// role: 'admin' resets unread_admin to 0, marks va messages as read

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await req.json()
  const { role } = body   // 'va' | 'admin'

  if (!role) return NextResponse.json({ error: 'role required' }, { status: 400 })

  if (role === 'va') {
    // Reset VA unread counter
    await supabase
      .from('support_conversations')
      .update({ unread_va: 0 })
      .eq('id', id)

    // Mark all unread admin messages as read
    await supabase
      .from('support_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', id)
      .eq('sender_role', 'admin')
      .is('read_at', null)

  } else if (role === 'admin') {
    // Reset admin unread counter
    await supabase
      .from('support_conversations')
      .update({ unread_admin: 0 })
      .eq('id', id)

    // Mark all unread VA messages as read
    await supabase
      .from('support_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', id)
      .eq('sender_role', 'va')
      .is('read_at', null)
  }

  return NextResponse.json({ ok: true })
}
