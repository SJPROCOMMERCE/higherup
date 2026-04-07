import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function GET() {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const db = genxDb()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  // 1. All active scripts with aggregate stats
  const { data: scripts } = await db
    .from('admin_outreach_scripts')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })

  // 2. Performance data (last 30 days)
  const { data: perfData } = await db
    .from('admin_script_performance')
    .select('script_id, prospect_type, channel, sent_by, outcome')
    .gte('sent_at', thirtyDaysAgo)

  // Group per script
  type PerfGroup = {
    total: number; replied: number; converted: number
    by_type: Record<string, { total: number; replied: number }>
    by_channel: Record<string, { total: number; replied: number }>
    by_person: Record<string, { total: number; replied: number }>
  }
  const scriptPerf: Record<string, PerfGroup> = {}

  for (const p of perfData || []) {
    if (!scriptPerf[p.script_id]) {
      scriptPerf[p.script_id] = { total: 0, replied: 0, converted: 0, by_type: {}, by_channel: {}, by_person: {} }
    }
    const sp = scriptPerf[p.script_id]
    sp.total++
    if (p.outcome === 'replied' || p.outcome === 'converted' || p.outcome === 'interested') sp.replied++
    if (p.outcome === 'converted') sp.converted++

    // Per prospect type
    const pt = p.prospect_type || 'unknown'
    if (!sp.by_type[pt]) sp.by_type[pt] = { total: 0, replied: 0 }
    sp.by_type[pt].total++
    if (p.outcome === 'replied' || p.outcome === 'converted' || p.outcome === 'interested') sp.by_type[pt].replied++

    // Per channel
    const ch = p.channel || 'unknown'
    if (!sp.by_channel[ch]) sp.by_channel[ch] = { total: 0, replied: 0 }
    sp.by_channel[ch].total++
    if (p.outcome === 'replied' || p.outcome === 'converted' || p.outcome === 'interested') sp.by_channel[ch].replied++

    // Per person
    if (p.sent_by) {
      if (!sp.by_person[p.sent_by]) sp.by_person[p.sent_by] = { total: 0, replied: 0 }
      sp.by_person[p.sent_by].total++
      if (p.outcome === 'replied' || p.outcome === 'converted' || p.outcome === 'interested') sp.by_person[p.sent_by].replied++
    }
  }

  // 3. Best script per prospect type (min 3 sends)
  const bestByType: Record<string, { script_id: string; script_title: string; rate: number; total: number }> = {}
  for (const [scriptId, perf] of Object.entries(scriptPerf)) {
    for (const [type, typePerf] of Object.entries(perf.by_type)) {
      if (typePerf.total >= 3) {
        const rate = Math.round(typePerf.replied / typePerf.total * 100)
        if (!bestByType[type] || rate > bestByType[type].rate) {
          const script = (scripts || []).find(s => s.id === scriptId)
          bestByType[type] = { script_id: scriptId, script_title: script?.title || 'Unknown', rate, total: typePerf.total }
        }
      }
    }
  }

  // 4. Best script per channel (min 3 sends)
  const bestByChannel: Record<string, { script_id: string; script_title: string; rate: number; total: number }> = {}
  for (const [scriptId, perf] of Object.entries(scriptPerf)) {
    for (const [channel, chanPerf] of Object.entries(perf.by_channel)) {
      if (chanPerf.total >= 3) {
        const rate = Math.round(chanPerf.replied / chanPerf.total * 100)
        if (!bestByChannel[channel] || rate > bestByChannel[channel].rate) {
          const script = (scripts || []).find(s => s.id === scriptId)
          bestByChannel[channel] = { script_id: scriptId, script_title: script?.title || 'Unknown', rate, total: chanPerf.total }
        }
      }
    }
  }

  // 5. Person performance (Safouane vs Joep)
  const personPerf: Record<string, { total: number; replied: number; best_script?: string; best_rate?: number }> = {}
  for (const [scriptId, perf] of Object.entries(scriptPerf)) {
    for (const [person, pp] of Object.entries(perf.by_person)) {
      if (!personPerf[person]) personPerf[person] = { total: 0, replied: 0 }
      personPerf[person].total += pp.total
      personPerf[person].replied += pp.replied

      // Track best script per person
      if (pp.total >= 2) {
        const rate = Math.round(pp.replied / pp.total * 100)
        if (!personPerf[person].best_rate || rate > personPerf[person].best_rate) {
          const script = (scripts || []).find(s => s.id === scriptId)
          personPerf[person].best_script = script?.title || 'Unknown'
          personPerf[person].best_rate = rate
        }
      }
    }
  }

  // 6. Generate recommendations
  const recommendations: string[] = []
  const scriptList = (scripts || []).map(s => ({
    ...s,
    perf30d: scriptPerf[s.id] || { total: 0, replied: 0, converted: 0 },
  }))
  const withEnoughData = scriptList.filter(s => s.perf30d.total >= 3)

  if (withEnoughData.length > 0) {
    const sorted = [...withEnoughData].sort((a, b) => {
      const rateA = a.perf30d.total > 0 ? a.perf30d.replied / a.perf30d.total : 0
      const rateB = b.perf30d.total > 0 ? b.perf30d.replied / b.perf30d.total : 0
      return rateB - rateA
    })

    const worst = sorted[sorted.length - 1]
    const best = sorted[0]
    const worstRate = worst.perf30d.total > 0 ? Math.round(worst.perf30d.replied / worst.perf30d.total * 100) : 0
    const bestRate = best.perf30d.total > 0 ? Math.round(best.perf30d.replied / best.perf30d.total * 100) : 0

    if (worstRate < 15 && bestRate > 40) {
      recommendations.push(`Stop using "${worst.title}" (${worstRate}% reply rate). Try "${best.title}" instead — it has ${bestRate}% reply rate.`)
    }
    if (best.perf30d.total >= 5 && bestRate > 50) {
      recommendations.push(`"${best.title}" is your top performer at ${bestRate}%. Use it more.`)
    }
  }

  return Response.json({
    scripts: scriptList.map(s => ({
      ...s,
      performance_30d: s.perf30d,
    })),
    best_by_prospect_type: bestByType,
    best_by_channel: bestByChannel,
    person_performance: Object.entries(personPerf).map(([person, pp]) => ({
      person,
      total: pp.total,
      replied: pp.replied,
      reply_rate: pp.total > 0 ? Math.round(pp.replied / pp.total * 100) : 0,
      best_script: pp.best_script || null,
      best_rate: pp.best_rate || 0,
    })),
    recommendations,
  })
}
