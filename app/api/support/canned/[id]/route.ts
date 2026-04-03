import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// ─── PATCH: Update canned response ────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if ('title'    in body) updates.title    = String(body.title).trim()
  if ('message'  in body) updates.message  = String(body.message).trim()
  if ('category' in body) updates.category = body.category ?? null

  // Increment usage_count when explicitly requested
  if (body.increment_usage) {
    const { data: current } = await supabase
      .from('support_canned_responses')
      .select('usage_count')
      .eq('id', id)
      .single()
    updates.usage_count = (current?.usage_count ?? 0) + 1
  }

  const { data, error } = await supabase
    .from('support_canned_responses')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ─── DELETE: Remove canned response ───────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { error } = await supabase.from('support_canned_responses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
