// Kolom namen: genx_toolkit gebruikt 'active' (niet 'is_active'), geen 'sort_order' voor migratie
import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function GET() {
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = genxDb()
  const { data, error } = await db
    .from('genx_toolkit')
    .select('*')                // select('*') werkt pre- en post-migratie
    .eq('active', true)         // ← ECHTE kolom naam: 'active' niet 'is_active'
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[toolkit] DB error:', error.message)
    return Response.json({ items: [] })
  }

  // Normaliseer: type=top-level category, category=subcategory (pre-migration)
  const items = (data || []).map(item => ({
    id:              item.id,
    category:        (item.type as string) || 'script',
    subcategory:     (item.subcategory as string | null) || (item.category as string | null) || null,
    channel:         (item.channel as string | null) || 'general',
    title:           item.title as string,
    description:     item.description as string | null,
    content:         item.content as string,
    attachment_url:  item.attachment_url as string | null,
    attachment_name: item.attachment_name as string | null,
    usage_count:     (item.copies as number) || 0,
  }))

  return Response.json({ items })
}
