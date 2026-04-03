import { supabase } from './supabase'

export const LG_EARNING_RATE = 0.05  // 20% of $0.25

export async function processLGEarnings(
  vaId: string,
  usageId: string | null,
  productCount: number,
  billingMonth: string
): Promise<{ lgId: string; amount: number } | null> {
  try {
    // Check if VA was referred by an LG
    const { data: referral } = await supabase
      .from('referral_tracking')
      .select('lg_id')
      .eq('va_id', vaId)
      .single()

    if (!referral) return null

    const lgId   = referral.lg_id as string
    const amount = Math.round(productCount * LG_EARNING_RATE * 100) / 100

    // Insert earning record
    const { error: earnError } = await supabase
      .from('lg_earnings')
      .insert({
        lg_id:         lgId,
        va_id:         vaId,
        usage_id:      usageId,
        billing_month: billingMonth,
        product_count: productCount,
        earning_rate:  LG_EARNING_RATE,
        amount,
      })

    if (earnError) {
      console.error('[genx] Error logging LG earnings:', earnError)
      return null
    }

    // Atomic increment on lead_generators.total_earnings
    await supabase.rpc('increment_lg_earnings', {
      lg_id_input:  lgId,
      amount_input: amount,
    })

    // Get VA name from vas table
    const { data: va } = await supabase
      .from('vas')
      .select('name')
      .eq('id', vaId)
      .single()

    const vaName = (va as { name?: string } | null)?.name || 'Unknown VA'

    // Insert pulse event
    await supabase.from('lg_pulse_events').insert({
      lg_id:           lgId,
      event_type:      'optimized',
      va_id:           vaId,
      va_display_name: vaName,
      product_count:   productCount,
      earning_amount:  amount,
    })

    // Update referral_tracking: last_active, lifetime products
    await supabase
      .from('referral_tracking')
      .update({ last_active_at: new Date().toISOString() })
      .eq('va_id', vaId)

    // Increment lifetime products (raw SQL via rpc or direct)
    void supabase.rpc('increment_referral_products', {
      va_id_input:    vaId,
      products_input: productCount,
    })  // Best-effort; cron recalcs daily

    // Set first_upload_at if null
    await supabase
      .from('referral_tracking')
      .update({
        first_upload_at: new Date().toISOString(),
        status: 'active',
      })
      .eq('va_id', vaId)
      .is('first_upload_at', null)

    console.log(`[genx] earnings | lg=${lgId} | va=${vaId} | ${productCount} products | $${amount.toFixed(2)}`)

    return { lgId, amount }
  } catch (e) {
    console.error('[genx] processLGEarnings error:', e)
    return null
  }
}
