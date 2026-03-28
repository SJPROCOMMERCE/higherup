import { supabase } from '@/lib/supabase'
import { getTiers, getTierSync } from '@/lib/pricing'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VaMonthEarnings {
  earned:   number   // VA's gross earned (variants × rate, clients with rates only)
  share:    number   // HigherUp's portion (tier amounts, clients with rates only)
  profit:   number   // earned − share
  hasRates: boolean  // at least one client has a rate set
  partial:  boolean  // only SOME clients have rates (earnings are partial)
}

// ─── getVaMonthEarnings ───────────────────────────────────────────────────────
// Returns earnings for a VA for a given month (format: 'YYYY-MM').
// Returns null if there are no done uploads for that month.

export async function getVaMonthEarnings(
  vaId:  string,
  month: string,
): Promise<VaMonthEarnings | null> {
  const [y, m] = month.split('-').map(Number)
  const start  = new Date(y, m - 1, 1).toISOString()
  const end    = new Date(y, m,     1).toISOString()

  const { data: uploads } = await supabase
    .from('uploads')
    .select('client_id, product_row_count, clients(va_rate_per_product)')
    .eq('va_id', vaId)
    .eq('status', 'done')
    .gte('uploaded_at', start)
    .lt('uploaded_at',  end)

  if (!uploads || uploads.length === 0) return null

  const pricingTiers = await getTiers()

  type Row = {
    client_id:         string
    product_row_count: number | null
    clients:           any
  }
  const rows = uploads as unknown as Row[]

  // Aggregate variant count + rate per client
  const clientAgg = new Map<string, { variants: number; rate: number | null }>()

  for (const row of rows) {
    // Supabase returns joined tables as array — normalise either shape
    const rate: number | null = Array.isArray(row.clients)
      ? (row.clients[0]?.va_rate_per_product ?? null)
      : (row.clients?.va_rate_per_product    ?? null)

    const existing = clientAgg.get(row.client_id)
    if (existing) {
      existing.variants += row.product_row_count ?? 0
    } else {
      clientAgg.set(row.client_id, {
        variants: row.product_row_count ?? 0,
        rate,
      })
    }
  }

  let earned    = 0
  let share     = 0
  let rateCount = 0

  for (const [, { variants, rate }] of clientAgg) {
    const tierAmt = getTierSync(pricingTiers, variants).amount
    if (rate != null) {
      earned    += variants * rate
      share     += tierAmt
      rateCount += 1
    }
  }

  const hasRates = rateCount > 0
  const partial  = hasRates && rateCount < clientAgg.size
  const profit   = earned - share

  return { earned, share, profit, hasRates, partial }
}

// ─── formatEarningsNotif ──────────────────────────────────────────────────────
// Returns { title, message } strings for earnings-first invoice notification.
// Pass invoiceAmount + fallback title/message for the no-rates case.

export function earningsInvoiceText(opts: {
  earnings:      VaMonthEarnings | null
  monthLabel:    string
  invoiceAmount: number
  dueByLabel:    string
  clientCount:   number
  totalVariants: number
}): { title: string; message: string } {
  const { earnings, monthLabel, invoiceAmount, dueByLabel, clientCount, totalVariants } = opts

  if (earnings?.hasRates) {
    const earnedFmt = `$${earnings.earned.toFixed(2)}`
    const profitFmt = `$${earnings.profit.toFixed(2)}`
    const shareFmt  = `$${invoiceAmount}`
    return {
      title:   `You earned ${earnedFmt} in ${monthLabel}`,
      message: `Profit: ${profitFmt} (${earnedFmt} earned − ${shareFmt} HigherUp share). Invoice for ${monthLabel} is ready. ${clientCount} client${clientCount !== 1 ? 's' : ''}, ${totalVariants.toLocaleString()} products. Due by ${dueByLabel}.`,
    }
  }

  return {
    title:   `Invoice for ${monthLabel} — $${invoiceAmount}`,
    message: `Your invoice for ${monthLabel} is ready. ${clientCount} client${clientCount !== 1 ? 's' : ''}, ${totalVariants.toLocaleString()} products, $${invoiceAmount} total. Due by ${dueByLabel}.`,
  }
}
