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
  const db = genxDb()
  const allowed = ['loss_reason', 'title', 'content', 'description', 'best_channel', 'expected_reply_rate', 'days_after_loss', 'sort_order', 'is_active']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key]
  }
  await db.from('admin_reactivation_templates').update(update).eq('id', id)
  return Response.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await genxDb().from('admin_reactivation_templates').update({ is_active: false }).eq('id', id)
  return Response.json({ ok: true })
}
