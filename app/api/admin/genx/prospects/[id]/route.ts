import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

const STAGE_TS: Record<string, string> = {
  identified: 'identified_at', contacted: 'contacted_at', replied: 'replied_at',
  interested: 'interested_at', pitch_sent: 'pitch_sent_at', call_scheduled: 'call_scheduled_at',
  call_done: 'call_done_at', signed_up: 'signed_up_at', onboarding: 'onboarding_at',
  active_lg: 'active_lg_at', declined: 'declined_at', lost: 'lost_at', revisit_later: 'revisit_later_at',
}

const REVISIT_DAYS: Record<string, number> = {
  wants_fixed_fee: 60, thinks_scam: 90, thinks_mlm: 90, no_network: 0,
  no_time: 30, no_reply_5plus: 60, no_reply_initial: 30, uses_competitor: 90,
  not_interested_listing: 0, too_complicated: 30, bad_timing: 14, other: 30,
}

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const db = genxDb()
  const [prospectRes, activitiesRes, lossHistoryRes, reactivationRes] = await Promise.all([
    db.from('admin_prospects').select('*').eq('id', id).single(),
    db.from('admin_prospect_activities').select('*').eq('prospect_id', id).order('created_at', { ascending: false }),
    db.from('admin_prospect_loss_history').select('*').eq('prospect_id', id).order('lost_at', { ascending: false }),
    db.from('admin_reactivation_cycles').select('*').eq('prospect_id', id).order('scheduled_at', { ascending: false }),
  ])
  if (!prospectRes.data) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({
    prospect: prospectRes.data,
    activities: activitiesRes.data || [],
    loss_history: lossHistoryRes.data || [],
    reactivation_cycles: reactivationRes.data || [],
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const db = genxDb()
  const now = new Date().toISOString()

  const isGoingLost = body.stage && (body.stage === 'lost' || body.stage === 'declined')

  // Validate loss reason is required for lost/declined
  if (isGoingLost && !body.loss_reason) {
    return Response.json({ error: 'loss_reason is required when marking as lost or declined' }, { status: 400 })
  }
  if (isGoingLost && body.loss_reason === 'other' && !body.loss_reason_detail) {
    return Response.json({ error: 'loss_reason_detail is required when reason is "other"' }, { status: 400 })
  }

  const allowed = [
    'name', 'email', 'phone', 'platform', 'handle', 'source', 'community_id',
    'stage', 'priority', 'follow_up_date', 'lost_reason', 'notes', 'tags', 'stage_index',
  ]
  const update: Record<string, unknown> = { updated_at: now }
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key]
  }

  // Track stage changes with timestamps
  if (body.stage && body.old_stage && body.stage !== body.old_stage) {
    const tsField = STAGE_TS[body.stage]
    if (tsField) update[tsField] = now

    // Loss reason handling
    if (isGoingLost) {
      update.loss_reason = body.loss_reason
      update.loss_reason_detail = body.loss_reason_detail || null
      update.lost_at = now
      update.lost_by = body.changed_by || null

      // Auto revisit date
      const revisitDays = REVISIT_DAYS[body.loss_reason] ?? 30
      if (revisitDays > 0) {
        update.revisit_at = new Date(Date.now() + revisitDays * 86400000).toISOString()
      } else {
        update.revisit_at = null
      }

      // Get current prospect for history context
      const { data: current } = await db.from('admin_prospects').select('stage, created_at, platform, times_lost').eq('id', id).single()
      const daysInPipeline = current ? Math.round((Date.now() - new Date(current.created_at).getTime()) / 86400000) : 0

      // Increment times_lost
      update.times_lost = (current?.times_lost || 0) + 1

      // Insert loss history record
      const { data: lossRecord } = await db.from('admin_prospect_loss_history').insert({
        prospect_id: id,
        lost_at: now,
        lost_by: body.changed_by || 'unknown',
        loss_reason: body.loss_reason,
        loss_reason_detail: body.loss_reason_detail || null,
        stage_before: body.old_stage,
        days_in_pipeline: daysInPipeline,
        channel: current?.platform || null,
      }).select('id').single()

      // Auto-schedule reactivation cycles based on templates
      if (revisitDays > 0) {
        const { data: templates } = await db
          .from('admin_reactivation_templates')
          .select('*')
          .eq('loss_reason', body.loss_reason)
          .eq('is_active', true)
          .order('days_after_loss', { ascending: true })

        for (const template of templates || []) {
          const scheduledAt = new Date(Date.now() + template.days_after_loss * 86400000)
          await db.from('admin_reactivation_cycles').insert({
            prospect_id: id,
            loss_history_id: lossRecord?.id || null,
            scheduled_at: scheduledAt.toISOString(),
            reason_for_revisit: 'scheduled_auto',
            script_to_use: template.title,
            custom_message: template.content,
            status: 'scheduled',
          })
        }
      }

      // Log activity with loss reason
      await db.from('admin_prospect_activities').insert({
        prospect_id: id,
        activity_type: 'status_change',
        description: `Marked as ${body.stage}. Reason: ${body.loss_reason}${body.loss_reason_detail ? '. Detail: ' + body.loss_reason_detail : ''}`,
        old_stage: body.old_stage,
        new_stage: body.stage,
      })
    } else {
      // Normal stage change activity log
      await db.from('admin_prospect_activities').insert({
        prospect_id: id,
        activity_type: 'status_change',
        description: `Stage: ${body.old_stage} → ${body.stage}`,
        old_stage: body.old_stage,
        new_stage: body.stage,
      })
    }

    // If reactivating from lost/declined, clear loss fields and mark history
    if ((body.old_stage === 'lost' || body.old_stage === 'declined') && body.stage !== 'lost' && body.stage !== 'declined') {
      update.loss_reason = null
      update.loss_reason_detail = null
      update.revisit_at = null

      // Mark latest loss history entry as reactivated
      const { data: latestLoss } = await db
        .from('admin_prospect_loss_history')
        .select('id')
        .eq('prospect_id', id)
        .is('reactivated_at', null)
        .order('lost_at', { ascending: false })
        .limit(1)
        .single()

      if (latestLoss) {
        await db.from('admin_prospect_loss_history').update({
          reactivated_at: now,
          reactivated_by: body.changed_by || 'unknown',
        }).eq('id', latestLoss.id)
      }

      // Cancel all scheduled reactivation cycles
      await db.from('admin_reactivation_cycles').update({
        status: 'skipped',
        result_note: 'Cancelled — prospect manually reactivated',
      }).eq('prospect_id', id).eq('status', 'scheduled')

      // Increment times_reactivated
      const { data: reactCurrent } = await db.from('admin_prospects').select('times_reactivated').eq('id', id).single()
      update.times_reactivated = (reactCurrent?.times_reactivated || 0) + 1
      update.last_reactivated_at = now
      update.last_reactivated_by = body.changed_by || 'unknown'

      await db.from('admin_prospect_activities').insert({
        prospect_id: id,
        activity_type: 'reactivation',
        description: `Reactivated from ${body.old_stage} → ${body.stage}`,
        old_stage: body.old_stage,
        new_stage: body.stage,
      })
    }
  }

  await db.from('admin_prospects').update(update).eq('id', id)
  return Response.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await genxDb().from('admin_prospects').delete().eq('id', id)
  return Response.json({ ok: true })
}
