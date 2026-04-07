import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function GET() {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const db = genxDb()

  const { data, error } = await db
    .from('admin_outreach_scripts')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ scripts: data || [] })
}

export async function POST(req: Request) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const db = genxDb()

  const { title, content, category, channel, target_prospect_type, description, created_by } = body
  if (!title || !content || !category) {
    return Response.json({ error: 'title, content, and category are required' }, { status: 400 })
  }

  const { data, error } = await db.from('admin_outreach_scripts').insert({
    title,
    content,
    category,
    channel: channel || 'general',
    target_prospect_type: target_prospect_type || 'any',
    description: description || null,
    created_by: created_by || null,
    is_default: false,
    sort_order: 99,
  }).select().single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ script: data })
}
