/**
 * GENX server-side DB client — uses service role key to bypass RLS.
 * Only import this in API routes and server components, NEVER in client components.
 */
import { createClient } from '@supabase/supabase-js'

export function genxDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

/**
 * Convert a billing month string to a Postgres DATE-compatible value.
 * getCurrentBillingMonth() returns 'YYYY-MM' but lg_earnings.billing_month
 * and other GENX tables use DATE type which requires 'YYYY-MM-01'.
 * Usage: toMonthDate('2026-04') → '2026-04-01'
 */
export function toMonthDate(month: string): string {
  if (/^\d{4}-\d{2}$/.test(month)) return `${month}-01`
  return month  // already full date or unexpected format — pass through
}
