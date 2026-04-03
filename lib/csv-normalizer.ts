/**
 * lib/csv-normalizer.ts
 *
 * Normalizes raw Shopify CSV rows before processing.
 *
 * Problem: Shopify exports only put Option Name on the FIRST (parent) row
 * of each product group. Variant rows 2-N have empty Option Name cells.
 *
 * Example (6-variant dress):
 *   Row 1: Option1 Name="Size", Option1 Value="XS"   ← parent row, has name
 *   Row 2: Option1 Name="",     Option1 Value="S"    ← empty name!
 *   Row 3: Option1 Name="",     Option1 Value="M"    ← empty name!
 *   ...
 *
 * Effect: SKU builder reads Option1 Name="" → skips size component → ALL
 * SKUs for rows 2-6 are missing the size segment ("sheer-dress" instead of
 * "sheer-dress-s", "sheer-dress-m", etc.)
 *
 * Fix: normalizeOptionNames() does a single forward-pass, inheriting the
 * last non-empty Option Name value into every subsequent empty cell.
 */

export function normalizeOptionNames(
  rows: Record<string, string>[],
  headers: string[],
): Record<string, string>[] {
  if (!rows.length) return rows

  // Collect the actual header strings for Option1/2/3 Name
  const optionNameCols: string[] = []
  for (let i = 1; i <= 3; i++) {
    const col = headers.find(h => h.toLowerCase() === `option${i} name`)
    if (col) optionNameCols.push(col)
  }

  // No option columns → nothing to normalise
  if (optionNameCols.length === 0) return rows

  // Track the last non-empty value seen per column
  const lastSeen: Record<string, string> = {}

  let normalizedCount = 0

  const result = rows.map((row, idx) => {
    const out = { ...row }
    for (const col of optionNameCols) {
      const val = String(row[col] ?? '').trim()
      if (val) {
        // Non-empty: update memory and keep the original value
        lastSeen[col] = val
      } else if (lastSeen[col]) {
        // Empty: inherit from the last row that had a value
        out[col] = lastSeen[col]
        if (idx > 0) normalizedCount++
      }
    }
    return out
  })

  if (normalizedCount > 0) {
    console.log(`[csv-normalizer] normalizeOptionNames: inherited Option Name into ${normalizedCount} previously-empty cells across ${rows.length} rows`)
  }

  return result
}
