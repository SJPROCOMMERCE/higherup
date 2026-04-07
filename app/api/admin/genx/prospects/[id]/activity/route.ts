import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const db = genxDb()
  const now = new Date().toISOString()

  // Insert activity with direction/sender fields
  const { data, error } = await db.from('admin_prospect_activities').insert({
    prospect_id: id,
    activity_type: body.activity_type,
    description: body.description || null,
    direction: body.direction || null,
    sender: body.sender || null,
    channel_used: body.channel_used || null,
  }).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const activityId = data.id

  // Update prospect's updated_at
  await db.from('admin_prospects').update({ updated_at: now }).eq('id', id)

  // Response speed tracking
  if (body.direction === 'inbound') {
    // Prospect replied to us — start the clock
    await db.from('admin_prospects').update({
      last_replied_at: now,
      has_unreplied: true,
      our_response_at: null,
      last_response_time_minutes: null,
    }).eq('id', id)

    await db.from('admin_response_speed_log').insert({
      prospect_id: id,
      reply_activity_id: activityId,
      reply_at: now,
      reply_channel: body.channel_used || null,
      status: 'waiting',
    })
  } else if (body.direction === 'outbound') {
    // We responded — check if there's an unreplied message
    const { data: prospect } = await db
      .from('admin_prospects')
      .select('last_replied_at, has_unreplied')
      .eq('id', id)
      .single()

    if (prospect?.has_unreplied && prospect.last_replied_at) {
      const responseMinutes = Math.round(
        (new Date(now).getTime() - new Date(prospect.last_replied_at).getTime()) / 60000
      )

      // Update prospect
      await db.from('admin_prospects').update({
        our_response_at: now,
        has_unreplied: false,
        last_response_time_minutes: responseMinutes,
      }).eq('id', id)

      // Close the speed log entry
      await db.from('admin_response_speed_log').update({
        response_activity_id: activityId,
        response_at: now,
        response_by: body.sender || null,
        response_time_minutes: responseMinutes,
        status: 'responded',
      }).eq('prospect_id', id).eq('status', 'waiting')

      // Tag the activity itself
      await db.from('admin_prospect_activities').update({
        response_time_minutes: responseMinutes,
      }).eq('id', activityId)
    }
  }

  return Response.json({ activity: data })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { data } = await genxDb()
    .from('admin_prospect_activities')
    .select('*')
    .eq('prospect_id', id)
    .order('created_at', { ascending: false })
  return Response.json({ activities: data || [] })
}
