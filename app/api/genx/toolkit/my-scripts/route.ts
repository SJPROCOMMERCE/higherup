import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = genxDb()
  const { data, error } = await db
    .from('lg_custom_scripts')
    .select('*')
    .eq('lg_id', session.lgId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[genx/toolkit/my-scripts] GET error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ scripts: data || [] })
}

export async function POST(req: Request) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, content, category, channel, notes, is_modified_from } = body

  if (!title?.trim() || !content?.trim() || !category?.trim()) {
    return Response.json({ error: 'title, content, and category are required' }, { status: 400 })
  }

  const db = genxDb()
  const { data, error } = await db
    .from('lg_custom_scripts')
    .insert({
      lg_id: session.lgId,
      title: title.trim(),
      content: content.trim(),
      category: category.trim(),
      channel: channel || 'general',
      notes: notes || null,
      is_modified_from: is_modified_from || null,
    })
    .select()
    .single()

  if (error) {
    console.error('[genx/toolkit/my-scripts] POST error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ script: data })
}
