import { supabase } from './supabase'

export async function generateActions(lgId: string): Promise<void> {
  const now = new Date()

  const { data: referrals } = await supabase
    .from('referral_tracking')
    .select('id, va_user_id, status, referred_at')
    .eq('lg_id', lgId)

  // Get VA names
  const vaIds = (referrals || []).map(r => r.va_user_id as string)
  let vaNames: Record<string, string> = {}
  if (vaIds.length) {
    const { data: vas } = await supabase.from('vas').select('id, name').in('id', vaIds)
    vaNames = Object.fromEntries((vas || []).map(v => [v.id as string, v.name as string]))
  }

  const actionsToInsert: Record<string, unknown>[] = []

  for (const ref of referrals || []) {
    const vaName = vaNames[ref.va_user_id as string] || 'Unknown VA'
    const daysSinceSignup = (now.getTime() - new Date(ref.referred_at as string).getTime()) / (1000 * 60 * 60 * 24)

    // Never activated after 3 days
    if (ref.status === 'active' && daysSinceSignup > 3 && daysSinceSignup < 14) {
      actionsToInsert.push({
        lg_id:      lgId,
        type:       'activate_new_va',
        priority:   'high',
        title:      `${vaName} signed up ${Math.floor(daysSinceSignup)}d ago — help them submit first upload`,
        body:       'Activation drops significantly after 48h without a first upload.',
        va_user_id: ref.va_user_id,
        expires_at: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      })
    }
  }

  // Overdue followups from outreach
  const { data: overdueFollowups } = await supabase
    .from('lg_outreach')
    .select('id, prospect_name, platform, status')
    .eq('lg_id', lgId)
    .lt('follow_up_at', now.toISOString())
    .in('status', ['contacted', 'interested'])

  for (const contact of overdueFollowups || []) {
    actionsToInsert.push({
      lg_id:    lgId,
      type:     'followup_prospect',
      priority: 'medium',
      title:    `Follow up with ${contact.prospect_name}`,
      body:     `Platform: ${contact.platform || 'unknown'}. Status: ${contact.status}.`,
      metadata: { outreach_id: contact.id },
      expires_at: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    })
  }

  // Remove expired actions
  await supabase
    .from('lg_actions')
    .update({ dismissed: true })
    .eq('lg_id', lgId)
    .eq('completed', false)
    .eq('dismissed', false)
    .lt('expires_at', now.toISOString())

  // Insert new actions (dedup by type + va_user_id)
  for (const action of actionsToInsert) {
    let query = supabase
      .from('lg_actions')
      .select('id')
      .eq('lg_id', lgId)
      .eq('type', action.type as string)
      .eq('completed', false)
      .eq('dismissed', false)

    if (action.va_user_id) {
      query = query.eq('va_user_id', action.va_user_id as string)
    }

    const { data: existing } = await query.maybeSingle()
    if (existing) continue

    await supabase.from('lg_actions').insert(action)
  }
}

export async function updateReferralStats(lgId: string): Promise<void> {
  // Update active_vas count on lead_generators
  const { count } = await supabase
    .from('referral_tracking')
    .select('id', { count: 'exact', head: true })
    .eq('lg_id', lgId)
    .eq('status', 'active')

  await supabase
    .from('lead_generators')
    .update({ active_vas: count || 0 })
    .eq('id', lgId)
}
