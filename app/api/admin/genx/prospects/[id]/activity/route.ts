import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

async function recalcScriptStats(db: SupabaseClient, scriptId: string) {
  const { data: records } = await db
    .from('admin_script_performance')
    .select('outcome')
    .eq('script_id', scriptId)
  if (!records || records.length === 0) return
  const total = records.length
  const replied = records.filter(r => r.outcome === 'replied' || r.outcome === 'converted' || r.outcome === 'interested').length
  const converted = records.filter(r => r.outcome === 'converted').length
  await db.from('admin_outreach_scripts').update({
    times_used: total,
    times_replied: replied,
    times_converted: converted,
    reply_rate: total > 0 ? Math.round(replied / total * 1000) / 10 : 0,
    conversion_rate: total > 0 ? Math.round(converted / total * 1000) / 10 : 0,
  }).eq('id', scriptId)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const db = genxDb()
  const now = new Date().toISOString()

  // Insert activity with direction/sender/script fields
  const activityInsert: Record<string, unknown> = {
    prospect_id: id,
    activity_type: body.activity_type,
    description: body.description || null,
    direction: body.direction || null,
    sender: body.sender || null,
    channel_used: body.channel_used || null,
  }
  // Script tracking fields
  if (body.script_id) activityInsert.script_id = body.script_id
  if (body.script_title) activityInsert.script_title = body.script_title
  if (body.script_modified != null) activityInsert.script_modified = body.script_modified
  if (body.actual_message_sent) activityInsert.actual_message_sent = body.actual_message_sent

  const { data, error } = await db.from('admin_prospect_activities').insert(activityInsert).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const activityId = data.id

  // Update prospect's updated_at
  await db.from('admin_prospects').update({ updated_at: now }).eq('id', id)

  // Script performance tracking (outbound with script)
  if (body.direction === 'outbound' && body.script_id) {
    // Increment times_used on the script
    const { data: script } = await db
      .from('admin_outreach_scripts')
      .select('times_used')
      .eq('id', body.script_id)
      .single()

    await db.from('admin_outreach_scripts').update({
      times_used: (script?.times_used || 0) + 1,
    }).eq('id', body.script_id)

    // Get prospect info for performance context
    const { data: prospectInfo } = await db
      .from('admin_prospects')
      .select('platform')
      .eq('id', id)
      .single()

    // Create performance record
    await db.from('admin_script_performance').insert({
      script_id: body.script_id,
      prospect_type: body.prospect_type || 'unknown',
      channel: body.channel_used || prospectInfo?.platform || 'unknown',
      sent_by: body.sender || null,
      outcome: 'no_reply',
      prospect_id: id,
      activity_id: activityId,
      sent_at: now,
    })
  }

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

    // Update script performance — mark last outbound script as 'replied'
    const { data: lastScriptPerf } = await db
      .from('admin_script_performance')
      .select('id, script_id, sent_at')
      .eq('prospect_id', id)
      .eq('outcome', 'no_reply')
      .order('sent_at', { ascending: false })
      .limit(1)
      .single()

    if (lastScriptPerf) {
      const respMin = Math.round((new Date(now).getTime() - new Date(lastScriptPerf.sent_at).getTime()) / 60000)
      await db.from('admin_script_performance').update({
        outcome: 'replied',
        reply_at: now,
        response_time_minutes: respMin,
      }).eq('id', lastScriptPerf.id)

      // Recalculate script aggregate stats
      await recalcScriptStats(db, lastScriptPerf.script_id)
    }
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
