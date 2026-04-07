// Maak een aangepaste kopie van een default script in lg_custom_scripts
import { getGenxSession } from '@/lib/genx-auth'
import { genxDb } from '@/lib/genx-db'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getGenxSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = genxDb()

  // Haal het originele default script op
  const { data: original, error: fetchErr } = await db
    .from('genx_toolkit')
    .select('category, subcategory, channel, title, content, description')
    .eq('id', id)
    .single()

  if (fetchErr || !original) {
    return Response.json({ error: 'Script not found' }, { status: 404 })
  }

  // Check of er al een kopie bestaat voor deze LG van dit script
  const { data: existing } = await db
    .from('lg_custom_scripts')
    .select('id')
    .eq('lg_id', session.lgId)
    .eq('is_modified_from', id)
    .maybeSingle()

  if (existing) {
    return Response.json({ script: existing, already_exists: true })
  }

  // Maak de kopie aan
  const { data: copy, error: insertErr } = await db
    .from('lg_custom_scripts')
    .insert({
      lg_id:           session.lgId,
      category:        (original.subcategory as string) || (original.category as string) || 'custom',
      channel:         (original.channel as string) || 'general',
      title:           original.title as string,
      content:         original.content as string,
      notes:           original.description as string | null,
      is_modified_from: id,
    })
    .select()
    .single()

  if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })
  return Response.json({ script: copy })
}
