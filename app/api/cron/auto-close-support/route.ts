import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const maxDuration = 60

// System sender UUID — a fixed placeholder for system-generated messages
// The trigger + RLS allow inserting with any valid user UUID; we use a known admin UUID
// stored in env, or fall back to a UUID that's excluded from RLS by service role
const SYSTEM_SENDER_ID = process.env.SYSTEM_USER_ID ?? '00000000-0000-0000-0000-000000000001'

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Date.now()
  const five_days_ago = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString()
  const seven_days_ago = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()

  const openStatuses = ['open', 'awaiting_admin', 'awaiting_va']

  // ── Step 1: Send warning to conversations inactive 5+ days ──────────
  const { data: warnConvos } = await supabase
    .from('support_conversations')
    .select('id')
    .in('status', openStatuses)
    .lt('last_message_at', five_days_ago)
    .eq('auto_close_warning_sent', false)

  let warned = 0
  for (const conv of warnConvos ?? []) {
    await supabase.from('support_messages').insert({
      conversation_id: conv.id,
      sender_id:       SYSTEM_SENDER_ID,
      sender_role:     'admin',
      message:         'This conversation will be automatically closed in 2 days due to inactivity. Reply to keep it open.',
      message_type:    'system',
    })
    await supabase
      .from('support_conversations')
      .update({ auto_close_warning_sent: true })
      .eq('id', conv.id)
    warned++
  }

  // ── Step 2: Close conversations inactive 7+ days ─────────────────────
  const { data: closeConvos } = await supabase
    .from('support_conversations')
    .select('id')
    .in('status', openStatuses)
    .lt('last_message_at', seven_days_ago)

  let closed = 0
  for (const conv of closeConvos ?? []) {
    await supabase.from('support_messages').insert({
      conversation_id: conv.id,
      sender_id:       SYSTEM_SENDER_ID,
      sender_role:     'admin',
      message:         'This conversation has been automatically closed due to inactivity. Start a new conversation if you still need help.',
      message_type:    'system',
    })
    await supabase
      .from('support_conversations')
      .update({
        status:    'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('id', conv.id)
    closed++
  }

  console.log(`[auto-close-support] warned=${warned} closed=${closed}`)
  return NextResponse.json({ ok: true, warned, closed })
}
