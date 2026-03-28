// ─── Backwards-compatible wrapper around lib/pricing.ts ──────────────────────
// Synchronous getTier() kept for components that haven't migrated to async tiers yet.
// All new code should use getTiers() / getTierSync() from lib/pricing.
import { DEFAULT_TIERS } from './pricing'

export type TierInfo = {
  name:   string
  amount: number
}

export function getTier(productCount: number): TierInfo {
  const tier = DEFAULT_TIERS.find(t =>
    productCount >= t.min_variants &&
    (t.max_variants === null || productCount <= t.max_variants)
  )
  return {
    name:   tier?.display_name ?? 'Enterprise',
    amount: tier?.amount       ?? 350,
  }
}
