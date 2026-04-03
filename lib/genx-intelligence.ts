import { supabase } from './supabase'

export async function generateActions(lgId: string): Promise<void> {
  const now = new Date()

  const { data: referrals } = await supabase
    .from('referral_tracking')
    .select('id, va_id, status, signed_up_at, first_upload_at, last_active_at, products_this_month, products_last_month, velocity_percent, avg_weekly_products, risk_flag')
    .eq('lg_id', lgId)

  // Get VA names
  const vaIds = (referrals || []).map(r => r.va_id as string)
  let vaNames: Record<string, string> = {}
  if (vaIds.length) {
    const { data: vas } = await supabase.from('vas').select('id, name').in('id', vaIds)
    vaNames = Object.fromEntries((vas || []).map(v => [v.id as string, v.name as string]))
  }

  const actionsToInsert: Record<string, unknown>[] = []

  for (const ref of referrals || []) {
    const vaName = vaNames[ref.va_id as string] || 'Unknown VA'
    const daysSinceSignup = (now.getTime() - new Date(ref.signed_up_at as string).getTime()) / (1000 * 60 * 60 * 24)
    const daysSinceActive = ref.last_active_at
      ? (now.getTime() - new Date(ref.last_active_at as string).getTime()) / (1000 * 60 * 60 * 24)
      : daysSinceSignup

    // Never uploaded after 48h
    if (!ref.first_upload_at && daysSinceSignup > 2 && daysSinceSignup < 14) {
      actionsToInsert.push({
        lg_id: lgId,
        action_type: 'activate_new_va',
        priority: 85,
        va_id: ref.va_id,
        title: `${vaName} signed up ${Math.floor(daysSinceSignup)} days ago but hasn't uploaded yet`,
        description: 'Activation rate drops significantly after 48 hours without a first upload.',
        suggested_actions: JSON.stringify([{ label: 'Reach out', type: 'message' }]),
        expires_at: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      })
    }

    // Active VA now inactive 7+ days
    if (ref.first_upload_at && daysSinceActive > 7 && ref.status !== 'churned') {
      actionsToInsert.push({
        lg_id: lgId,
        action_type: 'reactivate_va',
        priority: 75,
        va_id: ref.va_id,
        title: `${vaName} inactive for ${Math.floor(daysSinceActive)} days`,
        description: `Was listing ${ref.products_last_month} products/month. Last active ${Math.floor(daysSinceActive)} days ago.`,
        suggested_actions: JSON.stringify([{ label: 'Check in', type: 'message' }]),
        expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
    }

    // Volume drop 40%+
    if ((ref.velocity_percent as number) < -40 && (ref.products_this_month as number) > 0) {
      actionsToInsert.push({
        lg_id: lgId,
        action_type: 'declining_va',
        priority: 70,
        va_id: ref.va_id,
        title: `${vaName} volume dropped ${Math.abs(ref.velocity_percent as number).toFixed(0)}% this month`,
        description: `From ${ref.products_last_month} to ${ref.products_this_month} products.`,
        suggested_actions: JSON.stringify([{ label: 'Reach out', type: 'message' }]),
        expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
    }

    // Update risk flags
    let riskFlag: string | null = null
    let riskReason: string | null = null
    if ((ref.velocity_percent as number) < -40) {
      riskFlag = 'declining'
      riskReason = `Volume dropped ${Math.abs(ref.velocity_percent as number).toFixed(0)}% month over month`
    } else if (ref.first_upload_at && daysSinceActive > 14) {
      riskFlag = 'dormant'
      riskReason = `No activity for ${Math.floor(daysSinceActive)} days`
    } else if (!ref.first_upload_at && daysSinceSignup > 3) {
      riskFlag = 'stalled'
      riskReason = `Signed up ${Math.floor(daysSinceSignup)} days ago, never uploaded`
    }

    await supabase.from('referral_tracking').update({ risk_flag: riskFlag, risk_reason: riskReason }).eq('id', ref.id)
  }

  // Overdue followups from outreach log
  const { data: overdueFollowups } = await supabase
    .from('lg_outreach')
    .select('id, contact_name, contact_channel, pipeline_status')
    .eq('lg_id', lgId)
    .lt('next_followup_at', now.toISOString())
    .in('pipeline_status', ['contacted', 'interested'])

  for (const contact of overdueFollowups || []) {
    actionsToInsert.push({
      lg_id: lgId,
      action_type: 'followup_prospect',
      priority: 60,
      outreach_id: contact.id,
      title: `Follow up with ${contact.contact_name}`,
      description: `Last contacted via ${contact.contact_channel}. Status: ${contact.pipeline_status}.`,
      suggested_actions: JSON.stringify([
        { label: 'Follow up', type: 'outreach' },
        { label: 'Mark as lost', type: 'update_status', status: 'lost' },
      ]),
      expires_at: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    })
  }

  // Clean expired actions
  await supabase.from('lg_actions').delete().eq('lg_id', lgId).eq('status', 'pending').lt('expires_at', now.toISOString())

  // Insert new actions (skip duplicates by action_type + va_id combo)
  for (const action of actionsToInsert) {
    const { data: existing } = await supabase
      .from('lg_actions')
      .select('id')
      .eq('lg_id', lgId)
      .eq('action_type', action.action_type as string)
      .eq('status', 'pending')
      .maybeSingle()

    // More specific dedup check for VA-specific actions
    if (action.va_id) {
      const { data: vaExisting } = await supabase
        .from('lg_actions')
        .select('id')
        .eq('lg_id', lgId)
        .eq('action_type', action.action_type as string)
        .eq('va_id', action.va_id as string)
        .eq('status', 'pending')
        .maybeSingle()
      if (vaExisting) continue
    } else if (action.outreach_id) {
      const { data: outExisting } = await supabase
        .from('lg_actions')
        .select('id')
        .eq('lg_id', lgId)
        .eq('action_type', action.action_type as string)
        .eq('outreach_id', action.outreach_id as string)
        .eq('status', 'pending')
        .maybeSingle()
      if (outExisting) continue
    } else if (existing) {
      continue
    }

    await supabase.from('lg_actions').insert(action)
  }
}

export async function updateReferralStats(lgId: string): Promise<void> {
  const { getCurrentBillingMonth, getPreviousBillingMonth } = await import('./usage-tracker')
  const currentMonth = getCurrentBillingMonth()
  const lastMonth = getPreviousBillingMonth()
  const now = new Date()

  const { data: referrals } = await supabase
    .from('referral_tracking')
    .select('id, va_id, first_upload_at, products_this_month, products_last_month, signed_up_at')
    .eq('lg_id', lgId)

  for (const ref of referrals || []) {
    // Products this month from va_usage
    const { data: usageThis } = await supabase
      .from('va_usage')
      .select('product_count')
      .eq('va_id', ref.va_id)
      .eq('billing_month', currentMonth)

    const { data: usageLast } = await supabase
      .from('va_usage')
      .select('product_count')
      .eq('va_id', ref.va_id)
      .eq('billing_month', lastMonth)

    const productsThis = (usageThis || []).reduce((s, r) => s + (r.product_count || 0), 0)
    const productsLast = (usageLast || []).reduce((s, r) => s + (r.product_count || 0), 0)

    const velocity = productsLast > 0
      ? Math.round(((productsThis - productsLast) / productsLast) * 1000) / 10
      : (productsThis > 0 ? 100 : 0)

    let status = 'inactive'
    if (!ref.first_upload_at) {
      status = 'signed_up'
    } else if (productsThis >= 50) {
      status = 'active'
    } else if (productsThis > 0) {
      status = 'slow'
    }

    const daysSinceSignup = (now.getTime() - new Date(ref.signed_up_at as string).getTime()) / (1000 * 60 * 60 * 24)
    const healthScore = calcHealthScore(productsThis, productsLast, velocity, ref.first_upload_at as string | null, daysSinceSignup)

    await supabase.from('referral_tracking').update({
      products_this_month: productsThis,
      products_last_month: productsLast,
      velocity_percent: velocity,
      status,
      health_score: healthScore,
    }).eq('id', ref.id)
  }

  // Update active_referred on lead_generators
  const { count } = await supabase
    .from('referral_tracking')
    .select('id', { count: 'exact', head: true })
    .eq('lg_id', lgId)
    .in('status', ['active', 'slow'])

  await supabase.from('lead_generators').update({
    active_referred: count || 0,
    updated_at: now.toISOString(),
  }).eq('id', lgId)
}

function calcHealthScore(
  productsThis: number,
  productsLast: number,
  velocity: number,
  firstUploadAt: string | null,
  daysSinceSignup: number
): number {
  if (!firstUploadAt && daysSinceSignup > 3) return 10
  if (!firstUploadAt) return 30
  let score = 40
  score += Math.min(30, Math.round((productsThis / 200) * 30))
  score += Math.min(20, Math.max(0, Math.round((velocity / 50) * 20)))
  score += productsThis >= 50 ? 10 : productsThis > 0 ? 5 : 0
  return Math.min(100, Math.max(0, score))
}
