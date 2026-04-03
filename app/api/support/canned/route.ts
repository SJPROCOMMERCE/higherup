import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// ─── GET: List canned responses ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')

  let q = supabase
    .from('support_canned_responses')
    .select('*')
    .order('usage_count', { ascending: false })

  if (category) q = q.eq('category', category)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ─── POST: Create canned response ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { title, message, category, created_by } = body

  if (!title || !message) {
    return NextResponse.json({ error: 'title and message are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('support_canned_responses')
    .insert({ title: title.trim(), message: message.trim(), category: category ?? null, created_by: created_by ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
