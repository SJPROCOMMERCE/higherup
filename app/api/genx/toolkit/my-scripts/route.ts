// CRUD voor lg_custom_scripts — vereist dat scripts/genx-migrate.sql is uitgevoerd
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
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    // Tabel bestaat nog niet (migratie niet gedraaid)
    if (error.message.includes('does not exist')) {
      return Response.json({ scripts: [], migration_needed: true })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ scripts: data || [] })
}

export async function POST(req: Request) {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { category, channel, title, content, notes, is_modified_from } = body

  if (!title?.trim() || !content?.trim()) {
    return Response.json({ error: 'title and content are required' }, { status: 400 })
  }

  const db = genxDb()
  const { data, error } = await db
    .from('lg_custom_scripts')
    .insert({
      lg_id:           session.lgId,
      category:        category || 'custom',
      channel:         channel || 'general',
      title:           title.trim(),
      content:         content.trim(),
      notes:           notes?.trim() || null,
      is_modified_from: is_modified_from || null,
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ script: data })
}
