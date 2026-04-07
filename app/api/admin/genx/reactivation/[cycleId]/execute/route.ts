import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

const REVISIT_DAYS: Record<string, number> = {
  wants_fixed_fee: 60, thinks_scam: 90, thinks_mlm: 90, no_network: 0,
  no_time: 30, no_reply_5plus: 60, no_reply_initial: 30, uses_competitor: 90,
  not_interested_listing: 0, too_complicated: 30, bad_timing: 14, other: 30,
}

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function POST(req: Request, { params }: { params: Promise<{ cycleId: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { cycleId } = await params
  const body = await req.json()
  const db = genxDb()
  const now = new Date().toISOString()

  // action: 'send' | 'skip' | 'reactivate' | 'declined_again'
  const { action, by, note, new_stage, new_loss_reason, reactivation_note } = body
  if (!action || !by) return Response.json({ error: 'action and by are required' }, { status: 400 })

  // Get the cycle
  const { data: cycle } = await db
    .from('admin_reactivation_cycles')
    .select('*')
    .eq('id', cycleId)
    .single()

  if (!cycle) return Response.json({ error: 'Cycle not found' }, { status: 404 })

  const prospectId = cycle.prospect_id

  if (action === 'send') {
    // Mark as sent
    await db.from('admin_reactivation_cycles').update({
      status: 'sent',
      executed_at: now,
      executed_by: by,
      result_note: note || null,
    }).eq('id', cycleId)

    // Log activity
    await db.from('admin_prospect_activities').insert({
      prospect_id: prospectId,
      activity_type: 'reactivation_attempt',
      description: `Reactivation message sent. ${note || ''}`.trim(),
      direction: 'outbound',
      sender: by,
    })

    return Response.json({ ok: true })
  }

  if (action === 'skip') {
    await db.from('admin_reactivation_cycles').update({
      status: 'skipped',
      executed_at: now,
      executed_by: by,
      result_note: note || 'Skipped by admin',
    }).eq('id', cycleId)

    return Response.json({ ok: true })
  }

  if (action === 'reactivate') {
    const targetStage = new_stage || 'contacted'

    // Get current prospect for increment
    const { data: prospect } = await db
      .from('admin_prospects')
      .select('times_reactivated, stage')
      .eq('id', prospectId)
      .single()

    const newTimesReactivated = (prospect?.times_reactivated || 0) + 1

    // Update prospect
    await db.from('admin_prospects').update({
      stage: targetStage,
      times_reactivated: newTimesReactivated,
      last_reactivated_at: now,
      last_reactivated_by: by,
      reactivation_note: reactivation_note || null,
      revisit_at: null,
      has_unreplied: false,
      updated_at: now,
    }).eq('id', prospectId)

    // Update this cycle
    await db.from('admin_reactivation_cycles').update({
      status: 'converted',
      executed_at: now,
      executed_by: by,
      new_pipeline_status: targetStage,
      result_note: note || `Reactivated to ${targetStage}`,
    }).eq('id', cycleId)

    // Cancel all other scheduled cycles for this prospect
    await db.from('admin_reactivation_cycles').update({
      status: 'skipped',
      result_note: 'Cancelled — prospect was reactivated via another cycle',
    }).eq('prospect_id', prospectId).eq('status', 'scheduled')

    // Mark latest loss history as reactivated
    const { data: latestLoss } = await db
      .from('admin_prospect_loss_history')
      .select('id')
      .eq('prospect_id', prospectId)
      .is('reactivated_at', null)
      .order('lost_at', { ascending: false })
      .limit(1)
      .single()

    if (latestLoss) {
      await db.from('admin_prospect_loss_history').update({
        reactivated_at: now,
        reactivated_by: by,
      }).eq('id', latestLoss.id)
    }

    // Log activity
    await db.from('admin_prospect_activities').insert({
      prospect_id: prospectId,
      activity_type: 'reactivation',
      description: `Reactivated from ${prospect?.stage || 'lost'} to ${targetStage}. Attempt #${newTimesReactivated}. ${reactivation_note || ''}`.trim(),
      old_stage: prospect?.stage || 'lost',
      new_stage: targetStage,
      sender: by,
    })

    return Response.json({ ok: true })
  }

  if (action === 'declined_again') {
    const lossReason = new_loss_reason
    if (!lossReason) return Response.json({ error: 'new_loss_reason required' }, { status: 400 })

    // Update cycle
    await db.from('admin_reactivation_cycles').update({
      status: 'declined_again',
      executed_at: now,
      executed_by: by,
      result_note: `Declined again. Reason: ${lossReason}. ${note || ''}`.trim(),
    }).eq('id', cycleId)

    // Get prospect for times_lost
    const { data: prospect } = await db
      .from('admin_prospects')
      .select('times_lost, created_at, platform')
      .eq('id', prospectId)
      .single()

    const timesLost = (prospect?.times_lost || 0) + 1
    const baseRevisitDays = REVISIT_DAYS[lossReason] ?? 30
    // Escalation: multiply by times_lost, max 3x. After 3 declines: no more.
    const nextRevisitDays = timesLost >= 3 ? 0 : baseRevisitDays * Math.min(timesLost, 3)

    // Update prospect
    await db.from('admin_prospects').update({
      loss_reason: lossReason,
      lost_at: now,
      lost_by: by,
      times_lost: timesLost,
      revisit_at: nextRevisitDays > 0 ? new Date(Date.now() + nextRevisitDays * 86400000).toISOString() : null,
      updated_at: now,
    }).eq('id', prospectId)

    // Cancel other scheduled cycles
    await db.from('admin_reactivation_cycles').update({
      status: 'skipped',
      result_note: 'Cancelled — prospect declined again',
    }).eq('prospect_id', prospectId).eq('status', 'scheduled').neq('id', cycleId)

    // Loss history record
    const daysInPipeline = prospect ? Math.round((Date.now() - new Date(prospect.created_at).getTime()) / 86400000) : 0
    await db.from('admin_prospect_loss_history').insert({
      prospect_id: prospectId,
      lost_at: now,
      lost_by: by,
      loss_reason: lossReason,
      loss_reason_detail: note || null,
      stage_before: 'lost',
      days_in_pipeline: daysInPipeline,
      channel: prospect?.platform || null,
    })

    // Schedule new reactivation if not maxed out
    if (nextRevisitDays > 0) {
      const { data: templates } = await db
        .from('admin_reactivation_templates')
        .select('*')
        .eq('loss_reason', lossReason)
        .eq('is_active', true)
        .order('days_after_loss', { ascending: true })

      for (const template of templates || []) {
        const scheduledAt = new Date(Date.now() + template.days_after_loss * Math.min(timesLost, 3) * 86400000)
        await db.from('admin_reactivation_cycles').insert({
          prospect_id: prospectId,
          scheduled_at: scheduledAt.toISOString(),
          reason_for_revisit: 'scheduled_auto',
          script_to_use: template.title,
          custom_message: template.content,
          status: 'scheduled',
        })
      }
    }

    // Log activity
    await db.from('admin_prospect_activities').insert({
      prospect_id: prospectId,
      activity_type: 'status_change',
      description: `Reactivation attempt failed. Declined again: ${lossReason}. Attempt #${timesLost}. ${timesLost >= 3 ? 'Max attempts reached — no more reactivation.' : `Next revisit in ${nextRevisitDays} days.`}`,
      sender: by,
    })

    return Response.json({ ok: true })
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 })
}
