import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function GET() {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const db = genxDb()
  const { data } = await db
    .from('admin_reactivation_templates')
    .select('*')
    .eq('is_active', true)
    .order('loss_reason', { ascending: true })
    .order('days_after_loss', { ascending: true })
  return Response.json({ templates: data || [] })
}

export async function POST(req: Request) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const db = genxDb()
  const { data } = await db.from('admin_reactivation_templates').insert({
    loss_reason: body.loss_reason,
    title: body.title,
    content: body.content,
    description: body.description || null,
    best_channel: body.best_channel || null,
    expected_reply_rate: body.expected_reply_rate || null,
    days_after_loss: body.days_after_loss || 30,
    sort_order: body.sort_order || 0,
  }).select('*').single()
  return Response.json({ template: data })
}
