import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function GET() {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await genxDb()
    .from('admin_communities')
    .select('*')
    .order('created_at', { ascending: false })
  return Response.json({ communities: data || [] })
}

export async function POST(req: Request) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { data, error } = await genxDb().from('admin_communities').insert({
    name: body.name,
    platform: body.platform,
    url: body.url || null,
    description: body.description || null,
    member_count: body.member_count || 0,
    status: 'active',
    tags: body.tags || [],
    notes: body.notes || null,
  }).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ community: data })
}
