// ─── Per-product billing: $0.25/product, first 10/month/VA free ──────────────

import type { SupabaseClient } from '@supabase/supabase-js'

export const FREE_PRODUCTS_PER_MONTH = 10
export const PRICE_PER_PRODUCT       = 0.25

// ─── Billing month helpers ────────────────────────────────────────────────────

export function getCurrentBillingMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function getPreviousBillingMonth(): string {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = now.getMonth()       // 0-indexed
  if (m === 0) return `${y - 1}-12`
  return `${y}-${String(m).padStart(2, '0')}`
}

export function formatBillingMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MonthlyUsageSummary {
  billingMonth:     string
  totalProducts:    number
  freeProducts:     number
  billableProducts: number
  totalAmount:      number
  uploadCount:      number
}

export interface UsageLogResult {
  freeCount:     number
  billableCount: number
  totalAmount:   number
}

// ─── getMonthlyUsage ─────────────────────────────────────────────────────────
// Returns aggregate usage for a VA for a given billing month.

export async function getMonthlyUsage(
  supabaseClient: SupabaseClient,
  vaId:          string,
  billingMonth:  string,
): Promise<MonthlyUsageSummary> {
  const { data } = await supabaseClient
    .from('va_usage')
    .select('product_count, free_count, billable_count, total_amount')
    .eq('va_id', vaId)
    .eq('billing_month', billingMonth)

  const rows            = data ?? []
  const totalProducts   = rows.reduce((s, r) => s + (r.product_count  ?? 0), 0)
  const freeProducts    = rows.reduce((s, r) => s + (r.free_count     ?? 0), 0)
  const billableProducts = rows.reduce((s, r) => s + (r.billable_count ?? 0), 0)
  const totalAmount     = rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0)

  return {
    billingMonth,
    totalProducts,
    freeProducts,
    billableProducts,
    totalAmount:  Math.round(totalAmount * 100) / 100,
    uploadCount:  rows.length,
  }
}

// ─── logUsage ─────────────────────────────────────────────────────────────────
// Records usage for a single upload. Handles the free/billable split.
// Called by the processing engine immediately after a successful upload.

export async function logUsage(
  supabaseClient: SupabaseClient,
  vaId:          string,
  uploadId:      string,
  productCount:  number,
  source        = 'upload',
  billingMonth?: string,
): Promise<UsageLogResult> {
  const month = billingMonth ?? getCurrentBillingMonth()

  // Get how many products this VA has already used this month
  const current   = await getMonthlyUsage(supabaseClient, vaId, month)
  const usedSoFar = current.totalProducts

  // Calculate free / billable split for this upload
  let freeCount     = 0
  let billableCount = 0

  if (usedSoFar >= FREE_PRODUCTS_PER_MONTH) {
    // Already used all free slots — fully billable
    billableCount = productCount
  } else if (usedSoFar + productCount <= FREE_PRODUCTS_PER_MONTH) {
    // Fully within free allowance
    freeCount = productCount
  } else {
    // Straddles the boundary
    freeCount     = FREE_PRODUCTS_PER_MONTH - usedSoFar
    billableCount = productCount - freeCount
  }

  const totalAmount = Math.round(billableCount * PRICE_PER_PRODUCT * 100) / 100

  await supabaseClient.from('va_usage').insert({
    va_id:          vaId,
    upload_id:      uploadId,
    billing_month:  month,
    product_count:  productCount,
    free_count:     freeCount,
    billable_count: billableCount,
    total_amount:   totalAmount,
    source,
  })

  return { freeCount, billableCount, totalAmount }
}

// ─── calculateBillableAmount ─────────────────────────────────────────────────
// Pure calculation — given total products in a month, returns what's owed.

export function calculateBillableAmount(totalProducts: number): {
  freeProducts:     number
  billableProducts: number
  totalAmount:      number
} {
  const freeProducts     = Math.min(FREE_PRODUCTS_PER_MONTH, totalProducts)
  const billableProducts = Math.max(0, totalProducts - FREE_PRODUCTS_PER_MONTH)
  const totalAmount      = Math.round(billableProducts * PRICE_PER_PRODUCT * 100) / 100
  return { freeProducts, billableProducts, totalAmount }
}
