// ─── Product Pricing Engine ───────────────────────────────────────────────────
// Applies client-level pricing rules to CSV output rows.
// Runs AFTER Claude API processing, on every row independently.

export interface ProductPricingRules {
  maxDiscount:        number | null   // e.g. 30 = cap at 30% discount
  competitorPriceDiff: number | null  // e.g. 10 = 10% below compare-at price
  priceEnding:        string | null   // '.99' | '.95' | '.90' | '.00' | 'none'
  pricingBasis:       string | null   // 'compare_at' | 'manual'
}

export interface PriceResult {
  price:     number
  compareAt: number | null
}

// ─── Price ending helpers ─────────────────────────────────────────────────────

/**
 * Round price DOWN to target ending.
 * e.g. 44.30 → .95 ending = 43.95
 *      44.97 → .95 ending = 44.95
 */
function roundPriceDown(price: number, ending: string): number {
  const whole = Math.floor(price)
  switch (ending) {
    case '.99': {
      if (price >= whole + 0.99) return whole + 0.99
      return Math.max(0, whole - 1) + 0.99
    }
    case '.95': {
      if (price >= whole + 0.95) return whole + 0.95
      return Math.max(0, whole - 1) + 0.95
    }
    case '.90': {
      if (price >= whole + 0.90) return whole + 0.90
      return Math.max(0, whole - 1) + 0.90
    }
    case '.00':
      return Math.round(price)
    default:
      return price
  }
}

/**
 * Round compare-at price UP to target ending.
 * e.g. 49.60 → .99 ending = 49.99
 *      50.10 → .99 ending = 50.99
 */
function roundPriceUp(price: number, ending: string): number {
  const whole = Math.ceil(price)
  switch (ending) {
    case '.99': return whole - 0.01
    case '.95': return whole - 0.05
    case '.90': return whole - 0.10
    case '.00': return whole
    default:    return price
  }
}

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Apply client-level pricing rules to a single row's prices.
 *
 * Examples:
 *   compareAt=49.99, diff=10%, ending=.95
 *   → price = 49.99 × 0.90 = 44.99 → round down to .95 = 44.95
 *
 *   compareAt=29.99, diff=15%, maxDiscount=20%, ending=.99
 *   → price = 29.99 × 0.85 = 25.49 → round down to .99 = 24.99
 *   → check: (29.99-24.99)/29.99 = 16.7% ≤ 20% → OK
 *
 *   compareAt=19.99, diff=40%, maxDiscount=30%, ending=.95
 *   → price = 19.99 × 0.60 = 11.99 → but maxDiscount=30% → price = 19.99 × 0.70 = 13.99
 *   → round down to .95 = 13.95
 */
export function applyProductPricingRules(
  currentPrice: number,
  compareAtPrice: number | null,
  rules: ProductPricingRules,
): PriceResult {
  // Manual mode or no basis configured: leave prices unchanged
  if (!rules.pricingBasis || rules.pricingBasis === 'manual') {
    return { price: currentPrice, compareAt: compareAtPrice }
  }

  let newPrice    = currentPrice
  let newCompareAt = compareAtPrice

  // ── Step 1: Compute selling price from compare-at + competitor diff ───────
  if (rules.pricingBasis === 'compare_at' && compareAtPrice && compareAtPrice > 0) {
    if (rules.competitorPriceDiff != null && rules.competitorPriceDiff > 0) {
      newPrice = compareAtPrice * (1 - rules.competitorPriceDiff / 100)
    }
    // Keep compare-at as the reference "was" price — don't change it here
    newCompareAt = compareAtPrice
  }

  // ── Step 2: Enforce max discount cap ─────────────────────────────────────
  if (rules.maxDiscount != null && rules.maxDiscount > 0 && newCompareAt && newCompareAt > 0) {
    const actualDiscount = ((newCompareAt - newPrice) / newCompareAt) * 100
    if (actualDiscount > rules.maxDiscount) {
      // Too deep a discount — cap at max
      newPrice = newCompareAt * (1 - rules.maxDiscount / 100)
    }
  }

  // ── Step 3: Apply price ending ────────────────────────────────────────────
  const ending = rules.priceEnding && rules.priceEnding !== 'none' ? rules.priceEnding : null

  if (ending) {
    // Selling price rounds DOWN (customer gets the lower .xx price)
    newPrice = roundPriceDown(newPrice, ending)

    // Compare-at rounds UP (the "was" price looks a bit higher, which is normal retail)
    if (newCompareAt && newCompareAt > 0) {
      const roundedUp = roundPriceUp(newCompareAt, ending)
      if (roundedUp > newPrice) {
        newCompareAt = roundedUp
      }
    }
  }

  // ── Step 4: Sanity — selling price must be strictly below compare-at ──────
  if (newCompareAt != null && newPrice >= newCompareAt) {
    newPrice = newCompareAt - 0.01
    if (ending) newPrice = roundPriceDown(newPrice, ending)
  }

  // ── Step 5: Price must never be negative ──────────────────────────────────
  if (newPrice < 0) newPrice = 0

  return {
    price:     Math.round(newPrice    * 100) / 100,
    compareAt: newCompareAt != null ? Math.round(newCompareAt * 100) / 100 : null,
  }
}

// ─── Row-level helper ─────────────────────────────────────────────────────────

/**
 * Apply pricing rules to a single CSV row (mutates a copy).
 * Returns the updated row.
 */
export function applyPricingToRow(
  row: Record<string, string>,
  priceCol: string,
  compareAtCol: string,
  rules: ProductPricingRules,
): Record<string, string> {
  const out = { ...row }

  const currentPrice    = parseFloat(row[priceCol]    ?? '') || 0
  const compareAtPrice  = compareAtCol ? parseFloat(row[compareAtCol] ?? '') || null : null

  if (currentPrice <= 0) return out

  const result = applyProductPricingRules(currentPrice, compareAtPrice, rules)

  out[priceCol] = result.price.toFixed(2)
  if (compareAtCol && result.compareAt != null) {
    out[compareAtCol] = result.compareAt.toFixed(2)
  }

  return out
}
