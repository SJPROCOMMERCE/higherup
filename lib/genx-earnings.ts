import { createClient } from '@supabase/supabase-js'
import { toMonthDate } from './genx-db'

export const LG_EARNING_RATE = 0.05  // $0.05 per product

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function processLGEarnings(
  vaId: string,
  _usageId: string | null,  // kept for signature compatibility, not stored (column removed in schema v2)
  productCount: number,
  billingMonth: string
): Promise<{ lgId: string; amount: number } | null> {
  try {
    const db = admin()

    // Check if VA was referred by an LG
    const { data: referral } = await db
      .from('referral_tracking')
      .select('lg_id')
      .eq('va_user_id', vaId)
      .single()

    if (!referral) return null

    const lgId   = referral.lg_id as string
    const amount = Math.round(productCount * LG_EARNING_RATE * 100) / 100

    // Insert earning record (schema v2: no usage_id column)
    const { error: earnError } = await db.from('lg_earnings').insert({
      lg_id:         lgId,
      va_user_id:    vaId,
      billing_month: toMonthDate(billingMonth),
      products:      productCount,
      amount,
    })

    if (earnError) {
      console.error('[genx] Error logging LG earnings:', earnError)
      return null
    }

    // Get VA name
    const { data: va } = await db.from('vas').select('name').eq('id', vaId).single()
    const vaName = (va as { name?: string } | null)?.name || 'Unknown VA'

    // Pulse event
    await db.from('lg_pulse_events').insert({
      lg_id:   lgId,
      type:    'upload',
      payload: { va_id: vaId, va_name: vaName, products: productCount, amount },
    })

    // Update LG cached totals
    const { data: lgRow } = await db
      .from('lead_generators')
      .select('total_earned, pending_payout')
      .eq('id', lgId)
      .single()

    await db.from('lead_generators').update({
      total_earned:   ((lgRow?.total_earned as number) || 0) + amount,
      pending_payout: ((lgRow?.pending_payout as number) || 0) + amount,
    }).eq('id', lgId)

    console.log(`[genx] earnings | lg=${lgId} | va=${vaId} | ${productCount} products | $${amount.toFixed(2)}`)
    return { lgId, amount }
  } catch (e) {
    console.error('[genx] processLGEarnings error:', e)
    return null
  }
}
