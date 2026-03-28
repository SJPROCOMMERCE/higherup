import { supabase } from './supabase'

export interface Tier {
  id:           string
  tier_name:    string
  display_name: string
  min_variants: number
  max_variants: number | null
  amount:       number
  currency:     string
  description:  string | null
  is_active:    boolean
  sort_order:   number
  created_at:   string
  updated_at:   string
}

// ─── Default tiers (used as fallback while DB loads) ─────────────────────────
export const DEFAULT_TIERS: Tier[] = [
  { id: 'default-1', tier_name: 'tier_1', display_name: 'Starter',      min_variants: 0,    max_variants: 200,  amount: 50,  currency: 'USD', description: 'Perfect for small stores with up to 200 products per month',  is_active: true, sort_order: 1, created_at: '', updated_at: '' },
  { id: 'default-2', tier_name: 'tier_2', display_name: 'Growth',        min_variants: 201,  max_variants: 400,  amount: 110, currency: 'USD', description: 'For growing stores processing up to 400 products per month',    is_active: true, sort_order: 2, created_at: '', updated_at: '' },
  { id: 'default-3', tier_name: 'tier_3', display_name: 'Professional',  min_variants: 401,  max_variants: 1000, amount: 220, currency: 'USD', description: 'For established stores with high volume',                       is_active: true, sort_order: 3, created_at: '', updated_at: '' },
  { id: 'default-4', tier_name: 'tier_4', display_name: 'Enterprise',    min_variants: 1001, max_variants: null, amount: 350, currency: 'USD', description: 'Unlimited products for large-scale operations',                 is_active: true, sort_order: 4, created_at: '', updated_at: '' },
]

// ─── In-memory cache ──────────────────────────────────────────────────────────
let tiersCache:     Tier[] | null = null
let tiersCacheTime: number        = 0
const CACHE_TTL = 5 * 60 * 1000   // 5 minutes

export function invalidateTiersCache() {
  tiersCache     = null
  tiersCacheTime = 0
}

// ─── Main fetch ───────────────────────────────────────────────────────────────
export async function getTiers(): Promise<Tier[]> {
  if (tiersCache && Date.now() - tiersCacheTime < CACHE_TTL) {
    return tiersCache
  }
  const { data } = await supabase
    .from('pricing_tiers')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
  const result = (data ?? []) as Tier[]
  tiersCache     = result.length ? result : DEFAULT_TIERS
  tiersCacheTime = Date.now()
  return tiersCache
}

// ─── Async lookup ─────────────────────────────────────────────────────────────
export async function getTierForCount(variantCount: number): Promise<Tier> {
  const tiers = await getTiers()
  return getTierSync(tiers, variantCount)
}

// ─── Sync lookup (use after getTiers() resolves) ──────────────────────────────
export function getTierSync(tiers: Tier[], variantCount: number): Tier {
  const found = tiers.find(t =>
    variantCount >= t.min_variants &&
    (t.max_variants === null || variantCount <= t.max_variants)
  )
  return found ?? tiers[tiers.length - 1] ?? DEFAULT_TIERS[3]
}

// ─── Invoice calculation ──────────────────────────────────────────────────────
export interface InvoiceLineItem {
  client_id:     string
  variant_count: number
  tier:          Tier
  amount:        number
}

export async function calculateInvoice(
  clientVariants: { client_id: string; variant_count: number }[]
): Promise<{ line_items: InvoiceLineItem[]; total: number }> {
  const tiers = await getTiers()
  const line_items: InvoiceLineItem[] = clientVariants.map(cv => {
    const tier = getTierSync(tiers, cv.variant_count)
    return { client_id: cv.client_id, variant_count: cv.variant_count, tier, amount: tier.amount }
  })
  return { line_items, total: line_items.reduce((s, li) => s + li.amount, 0) }
}

// ─── Format tier range ────────────────────────────────────────────────────────
export function formatTierRange(tier: Tier): string {
  if (tier.max_variants === null) return `${tier.min_variants.toLocaleString()}+`
  return `${tier.min_variants.toLocaleString()} — ${tier.max_variants.toLocaleString()}`
}
