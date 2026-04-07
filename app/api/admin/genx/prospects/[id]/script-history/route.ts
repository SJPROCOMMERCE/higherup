import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const db = genxDb()

  // 1. Get the prospect (need platform/source for type inference)
  const { data: prospect } = await db.from('admin_prospects').select('name, platform, source, stage, loss_reason').eq('id', id).single()
  if (!prospect) return Response.json({ error: 'Not found' }, { status: 404 })

  // 2. Get all script performance records for this prospect
  const { data: perfRecords } = await db
    .from('admin_script_performance')
    .select('*, admin_outreach_scripts(title, category, channel, target_prospect_type)')
    .eq('prospect_id', id)
    .order('sent_at', { ascending: true })

  // Build history list
  const history = (perfRecords || []).map(r => ({
    script_id: r.script_id,
    script_title: r.admin_outreach_scripts?.title || 'Unknown',
    script_category: r.admin_outreach_scripts?.category || 'unknown',
    sent_by: r.sent_by,
    sent_at: r.sent_at,
    outcome: r.outcome,
    response_time_minutes: r.response_time_minutes,
  }))

  // 3. Infer prospect type from platform/source
  let prospectType = 'any'
  const platform = (prospect.platform || '').toLowerCase()
  const source = (prospect.source || '').toLowerCase()
  if (source.includes('agency') || platform.includes('agency')) prospectType = 'agency_owner'
  else if (source.includes('community') || source.includes('group')) prospectType = 'community_leader'
  else if (source.includes('content') || source.includes('creator') || platform.includes('youtube') || platform.includes('tiktok')) prospectType = 'content_creator'
  else if (source.includes('individual') || source.includes('manual') || source.includes('dm')) prospectType = 'individual'

  // 4. Find best performing script for this prospect type (min 3 sends, across all prospects)
  const { data: typePerf } = await db
    .from('admin_script_performance')
    .select('script_id, outcome')
    .or(prospectType === 'any' ? 'prospect_type.is.null' : `prospect_type.eq.${prospectType},prospect_type.eq.any,prospect_type.is.null`)

  const scriptStats: Record<string, { total: number; replied: number }> = {}
  for (const p of typePerf || []) {
    if (!scriptStats[p.script_id]) scriptStats[p.script_id] = { total: 0, replied: 0 }
    scriptStats[p.script_id].total++
    if (p.outcome === 'replied' || p.outcome === 'converted' || p.outcome === 'interested') {
      scriptStats[p.script_id].replied++
    }
  }

  // Get script details for suggestions
  const scriptIds = Object.keys(scriptStats).filter(sid => scriptStats[sid].total >= 3)
  const { data: scriptDetails } = await db
    .from('admin_outreach_scripts')
    .select('id, title, category, channel, target_prospect_type, reply_rate')
    .in('id', scriptIds.length > 0 ? scriptIds : ['none'])
    .eq('is_active', true)

  // Find best by type
  let bestForType: { title: string; rate: number; total: number } | null = null
  for (const s of scriptDetails || []) {
    const stats = scriptStats[s.id]
    if (stats && stats.total >= 3) {
      const rate = Math.round(stats.replied / stats.total * 100)
      if (!bestForType || rate > bestForType.rate) {
        bestForType = { title: s.title, rate, total: stats.total }
      }
    }
  }

  // 5. Smart suggestion: find what to try next based on current stage + loss reason
  const usedScriptIds = new Set(history.map(h => h.script_id))
  let suggestion: { title: string; reason: string } | null = null

  if (prospect.loss_reason) {
    // Find objection handling scripts not yet used on this prospect
    const { data: objectionScripts } = await db
      .from('admin_outreach_scripts')
      .select('id, title, reply_rate')
      .eq('category', 'objection_handling')
      .eq('is_active', true)
      .order('reply_rate', { ascending: false })

    const unused = (objectionScripts || []).filter(s => !usedScriptIds.has(s.id))
    if (unused.length > 0) {
      // Find scripts that work for this loss reason by looking at conversion data
      const { data: conversionData } = await db
        .from('admin_script_performance')
        .select('script_id, outcome')
        .in('script_id', unused.map(s => s.id))

      const convStats: Record<string, { total: number; converted: number }> = {}
      for (const c of conversionData || []) {
        if (!convStats[c.script_id]) convStats[c.script_id] = { total: 0, converted: 0 }
        convStats[c.script_id].total++
        if (c.outcome === 'converted') convStats[c.script_id].converted++
      }

      // Sort by conversion rate
      const ranked = unused
        .map(s => ({ ...s, convRate: convStats[s.id] ? Math.round(convStats[s.id].converted / convStats[s.id].total * 100) : 0, convTotal: convStats[s.id]?.total || 0 }))
        .sort((a, b) => b.convRate - a.convRate || b.convTotal - a.convTotal)

      if (ranked.length > 0) {
        const best = ranked[0]
        suggestion = {
          title: best.title,
          reason: best.convTotal >= 3
            ? `converts ${best.convRate}% of prospects with "${prospect.loss_reason?.replace(/_/g, ' ')}" objection`
            : `highest rated objection script not yet used on this prospect`,
        }
      }
    }
  } else if (prospect.stage === 'contacted' || prospect.stage === 'identified') {
    // Suggest follow-up scripts not used
    const { data: followUpScripts } = await db
      .from('admin_outreach_scripts')
      .select('id, title, reply_rate')
      .eq('category', 'follow_up')
      .eq('is_active', true)
      .order('reply_rate', { ascending: false })

    const unused = (followUpScripts || []).filter(s => !usedScriptIds.has(s.id))
    if (unused.length > 0) {
      suggestion = {
        title: unused[0].title,
        reason: `best follow-up script not yet tried (${unused[0].reply_rate}% reply rate)`,
      }
    }
  } else if (prospect.stage === 'interested' || prospect.stage === 'pitch_sent') {
    // Suggest closing scripts
    const { data: closingScripts } = await db
      .from('admin_outreach_scripts')
      .select('id, title, reply_rate')
      .eq('category', 'closing')
      .eq('is_active', true)
      .order('reply_rate', { ascending: false })

    const unused = (closingScripts || []).filter(s => !usedScriptIds.has(s.id))
    if (unused.length > 0) {
      suggestion = {
        title: unused[0].title,
        reason: `best closing script not yet tried (${unused[0].reply_rate}% reply rate)`,
      }
    }
  }

  return Response.json({
    history,
    prospect_type: prospectType,
    best_for_type: bestForType,
    suggestion,
  })
}
