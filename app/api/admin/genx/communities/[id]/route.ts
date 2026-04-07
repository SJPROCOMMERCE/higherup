import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const allowed = [
    'name', 'platform', 'url', 'description', 'member_count', 'status', 'tags', 'notes',
    'quality_rating', 'priority', 'admin_name', 'admin_handle', 'admin_contacted', 'admin_notes',
    'we_are_member', 'joined_date', 'posts_made', 'last_posted_at',
    'vas_from_here', 'total_products_from_here', 'revenue_from_here', 'lg_earnings_from_here',
    'active_lgs',
  ]
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key]
  }
  await genxDb().from('admin_communities').update(update).eq('id', id)
  return Response.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await genxDb().from('admin_communities').delete().eq('id', id)
  return Response.json({ ok: true })
}
