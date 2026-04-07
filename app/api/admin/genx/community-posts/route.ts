import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function GET(req: Request) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const communityId = searchParams.get('community_id')
  const db = genxDb()
  let query = db.from('admin_community_posts').select('*, admin_outreach_scripts(title, category)').order('posted_at', { ascending: false })
  if (communityId) query = query.eq('community_id', communityId)
  const { data } = await query
  return Response.json({ posts: data || [] })
}

export async function POST(req: Request) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const db = genxDb()
  const { data } = await db.from('admin_community_posts').insert({
    community_id: body.community_id,
    script_id: body.script_id || null,
    title: body.title || null,
    content: body.content,
    posted_by: body.posted_by || null,
    posted_at: body.posted_at || new Date().toISOString(),
    platform: body.platform || null,
    dms_received: body.dms_received || 0,
    replies_received: body.replies_received || 0,
    prospects_generated: body.prospects_generated || 0,
    notes: body.notes || null,
  }).select('*').single()

  // Update community posts_made and last_posted_at
  if (data) {
    const { data: community } = await db.from('admin_communities').select('posts_made').eq('id', body.community_id).single()
    await db.from('admin_communities').update({
      posts_made: (community?.posts_made || 0) + 1,
      last_posted_at: body.posted_at || new Date().toISOString(),
    }).eq('id', body.community_id)
  }

  return Response.json({ post: data })
}
