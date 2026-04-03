import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// ─── GET: List conversations ────────────────────────────────────────────────
// VA: own conversations sorted by last_message_at
// Admin: all conversations with filters (status, category, priority)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const vaId     = searchParams.get('va_id')
  const isAdmin  = searchParams.get('admin') === '1'
  const status   = searchParams.get('status')
  const category = searchParams.get('category')
  const priority = searchParams.get('priority')
  const assigned = searchParams.get('assigned_to')  // admin user id

  if (!vaId && !isAdmin) {
    return NextResponse.json({ error: 'va_id required' }, { status: 400 })
  }

  let q = supabase
    .from('support_conversations')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })

  if (!isAdmin && vaId) {
    q = q.eq('va_id', vaId)
  }
  if (status)   q = q.eq('status', status)
  if (category) q = q.eq('category', category)
  if (priority) q = q.eq('priority', priority)
  if (assigned) q = q.eq('admin_id', assigned)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ─── POST: Create new conversation ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { va_id, subject, category, message } = body

  if (!va_id || !subject || !category || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (subject.length < 5 || subject.length > 100) {
    return NextResponse.json({ error: 'Subject must be 5–100 characters' }, { status: 400 })
  }
  if (message.length < 10 || message.length > 2000) {
    return NextResponse.json({ error: 'Message must be 10–2000 characters' }, { status: 400 })
  }

  const validCategories = ['bug', 'question', 'feature_request', 'billing', 'general']
  if (!validCategories.includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  // ── Rate limit 1: max 3 open conversations ─────────────────────────────
  const { count: openCount } = await supabase
    .from('support_conversations')
    .select('*', { count: 'exact', head: true })
    .eq('va_id', va_id)
    .in('status', ['open', 'awaiting_admin', 'awaiting_va'])

  if ((openCount ?? 0) >= 3) {
    return NextResponse.json({
      error: 'You can have a maximum of 3 open conversations. Please resolve existing ones first.',
    }, { status: 429 })
  }

  // ── Rate limit 2: max 1 new conversation per 5 minutes ────────────────
  const { data: recentConvo } = await supabase
    .from('support_conversations')
    .select('created_at')
    .eq('va_id', va_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recentConvo) {
    const timeSince = Date.now() - new Date(recentConvo.created_at).getTime()
    if (timeSince < 5 * 60 * 1000) {
      return NextResponse.json({
        error: 'Please wait a few minutes before starting a new conversation.',
      }, { status: 429 })
    }
  }

  // ── Rate limit 3: max 20 messages per hour ────────────────────────────
  const { count: msgCount } = await supabase
    .from('support_messages')
    .select('*', { count: 'exact', head: true })
    .eq('sender_id', va_id)
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

  if ((msgCount ?? 0) >= 20) {
    return NextResponse.json({
      error: 'Message limit reached. Please wait before sending more messages.',
    }, { status: 429 })
  }

  // ── Determine priority ────────────────────────────────────────────────
  const priorityMap: Record<string, string> = {
    bug: 'high',
    question: 'normal',
    feature_request: 'low',
    billing: 'normal',
    general: 'normal',
  }
  const priority = priorityMap[category] ?? 'normal'

  // ── Create conversation ───────────────────────────────────────────────
  const { data: conv, error: convErr } = await supabase
    .from('support_conversations')
    .insert({
      va_id,
      subject: subject.trim(),
      category,
      priority,
      status: 'awaiting_admin',
    })
    .select()
    .single()

  if (convErr || !conv) {
    return NextResponse.json({ error: convErr?.message ?? 'Failed to create conversation' }, { status: 500 })
  }

  // ── Insert first message ──────────────────────────────────────────────
  const { error: msgErr } = await supabase
    .from('support_messages')
    .insert({
      conversation_id: conv.id,
      sender_id:       va_id,
      sender_role:     'va',
      message:         message.trim(),
      message_type:    'text',
    })

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 })
  }

  return NextResponse.json(conv, { status: 201 })
}
