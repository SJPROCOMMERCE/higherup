import { genxDb } from '@/lib/genx-db'
import { cookies } from 'next/headers'

const PIPELINE = ['identified','contacted','replied','interested','pitch_sent','call_scheduled','call_done','signed_up','onboarding','active_lg']
const TERMINAL = ['declined','lost','revisit_later']
const TS_FIELDS: Record<string, string> = {
  identified:'identified_at', contacted:'contacted_at', replied:'replied_at',
  interested:'interested_at', pitch_sent:'pitch_sent_at', call_scheduled:'call_scheduled_at',
  call_done:'call_done_at', signed_up:'signed_up_at', onboarding:'onboarding_at', active_lg:'active_lg_at',
}

async function checkAdmin() {
  const cookieStore = await cookies()
  return !!cookieStore.get('admin_session')?.value
}

export async function GET() {
  if (!await checkAdmin()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const db = genxDb()

  const { data: prospects } = await db.from('admin_prospects').select('*')
  const rows = prospects || []

  // 1. Count per stage
  const counts: Record<string, number> = {}
  for (const s of [...PIPELINE, ...TERMINAL]) counts[s] = 0
  for (const p of rows) counts[p.stage] = (counts[p.stage] || 0) + 1

  // 2. Reached counts (how many ever reached this stage = have the timestamp)
  const reached: Record<string, number> = {}
  for (const s of PIPELINE) {
    const field = TS_FIELDS[s]
    if (field) reached[s] = rows.filter(p => p[field] != null).length
    else reached[s] = counts[s]
  }

  // 3. Build funnel steps with conversion rates
  const steps = PIPELINE.map((stage, i) => {
    const reachedCount = reached[stage] || 0
    const prevReached = i > 0 ? (reached[PIPELINE[i - 1]] || 0) : null

    // Conversion rate = reached this stage / reached previous stage
    let rate: number | null = null
    if (prevReached !== null && prevReached > 0) {
      rate = Math.round((reachedCount / prevReached) * 1000) / 10
    }

    // Avg hours from previous stage to this stage
    let avgHours: number | null = null
    if (i > 0) {
      const prevField = TS_FIELDS[PIPELINE[i - 1]]
      const thisField = TS_FIELDS[stage]
      if (prevField && thisField) {
        const times: number[] = []
        for (const p of rows) {
          if (p[prevField] && p[thisField]) {
            const diff = new Date(p[thisField]).getTime() - new Date(p[prevField]).getTime()
            if (diff > 0) times.push(diff / 3600000) // hours
          }
        }
        if (times.length > 0) avgHours = Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10
      }
    }

    return { stage, count: counts[stage], reached: reachedCount, rate_from_previous: rate, avg_hours: avgHours }
  })

  // 4. Overall rate: identified → active_lg
  const identifiedCount = reached['identified'] || 0
  const activeLgCount = reached['active_lg'] || 0
  const overallRate = identifiedCount > 0 ? Math.round((activeLgCount / identifiedCount) * 1000) / 10 : 0

  // 5. Bottleneck: lowest conversion rate
  let bottleneck: { from: string; to: string; rate: number; drop_off: number; message: string } | null = null
  let worstRate = 101
  for (let i = 1; i < steps.length; i++) {
    const r = steps[i].rate_from_previous
    if (r !== null && r < worstRate && (steps[i - 1].reached || 0) >= 3) {
      worstRate = r
      bottleneck = {
        from: PIPELINE[i - 1], to: PIPELINE[i],
        rate: r, drop_off: Math.round((100 - r) * 10) / 10,
        message: getBottleneckMsg(PIPELINE[i - 1], PIPELINE[i], 100 - r),
      }
    }
  }

  // 6. Stuck prospects (on a stage for 7+ days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const stuck: Record<string, number> = {}
  for (const s of PIPELINE.slice(0, -1)) { // exclude active_lg
    const field = TS_FIELDS[s]
    if (!field) continue
    stuck[s] = rows.filter(p => p.stage === s && p[field] && p[field] < sevenDaysAgo).length
  }

  // 7. Terminal counts
  const terminal: Record<string, number> = {}
  for (const s of TERMINAL) terminal[s] = counts[s] || 0

  return Response.json({
    steps, overallRate, bottleneck, stuck, terminal,
    total: rows.length,
  })
}

function getBottleneckMsg(from: string, to: string, dropOff: number): string {
  const pct = dropOff.toFixed(0)
  const msgs: Record<string, string> = {
    'identified-contacted': `${pct}% of identified prospects are never contacted. Speed up your outreach.`,
    'contacted-replied': `${pct}% of contacted prospects never reply. Your first message needs improvement.`,
    'replied-interested': `${pct}% of replies don't convert to interest. Improve your pitch.`,
    'interested-pitch_sent': `${pct}% of interested prospects never get a pitch. Speed up pitch delivery.`,
    'pitch_sent-call_scheduled': `${pct}% of pitched prospects never schedule a call. Your pitch may not be compelling.`,
    'call_scheduled-call_done': `${pct}% of scheduled calls don't happen. Send better reminders.`,
    'call_done-signed_up': `${pct}% of called prospects don't sign up. Improve your closing.`,
    'signed_up-onboarding': `${pct}% of sign-ups never start onboarding. Fix your onboarding flow.`,
    'onboarding-active_lg': `${pct}% of onboarding LGs never become active. Improve activation support.`,
  }
  return msgs[`${from}-${to}`] || `${pct}% drop-off at this stage.`
}
