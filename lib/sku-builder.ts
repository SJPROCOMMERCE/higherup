/**
 * lib/sku-builder.ts
 *
 * Standalone SKU building utilities used by the processing engine.
 *
 * Design:
 * - OPTION_ALIASES maps each SKU keyword to all known translations of that
 *   option name across supported languages. This lets "color" in a structure
 *   string match the option named "Kleur" in a Dutch CSV, "Couleur" in a
 *   French one, "Colour" in a British one, etc.
 * - slugify() produces a consistent lowercase-hyphen format.
 * - resolveOptionKeyword() returns the canonical keyword for a given option
 *   name string, so callers can normalise before matching.
 * - buildSKU() is a standalone builder that works on a plain product object
 *   (option1_name / option1_value style). Used as the server-side safety net.
 * - validateAndFixSKUs() post-processes a batch after parsing Claude's output.
 */

// ─── Slug helper ──────────────────────────────────────────────────────────────

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\-àáâãäåèéêëìíîïòóôõöùúûüýÿñçßæøœ]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// ─── Option aliases ────────────────────────────────────────────────────────────
//
// Each key is the canonical SKU keyword.
// Each value is the list of option NAME strings (any language) that map to it.
// Add new languages here as the platform expands.

export const OPTION_ALIASES: Record<string, string[]> = {
  color: [
    'color', 'colour',                   // English
    'kleur',                             // Dutch
    'couleur',                           // French
    'farbe',                             // German
    'warna',                             // Indonesian / Malay
    'colore',                            // Italian
    'color', 'colour',                   // Spanish / Portuguese (same)
    'cor',                               // Portuguese
    'färg',                              // Swedish
    'farge', 'farge',                    // Norwegian / Danish
    'kolor',                             // Polish
    'barva',                             // Czech
    'szín',                              // Hungarian
  ],
  size: [
    'size',                              // English
    'maat',                              // Dutch
    'taille',                            // French
    'größe', 'groesse', 'grösse',        // German
    'ukuran',                            // Indonesian
    'tamaño', 'tamano',                  // Spanish
    'taglia',                            // Italian
    'tamanho',                           // Portuguese
    'storlek',                           // Swedish
    'størrelse',                         // Danish / Norwegian
    'rozmiar',                           // Polish
    'velikost',                          // Czech
    'méret',                             // Hungarian
  ],
  material: [
    'material',                          // English / Spanish
    'materiaal',                         // Dutch
    'matière', 'matiere',                // French
    'stoff', 'material',                 // German
    'bahan',                             // Indonesian
    'materiale',                         // Italian
    'material',                          // Portuguese
    'material',                          // Swedish / Danish / Norwegian
    'materiał', 'material',              // Polish
    'materiál',                          // Czech
    'anyag',                             // Hungarian
  ],
  style: [
    'style',                             // English / French
    'stijl',                             // Dutch
    'stil',                              // German / Swedish / Danish / Norwegian
    'estilo',                            // Spanish / Portuguese
    'stile',                             // Italian
    'styl',                              // Polish
    'styl',                              // Czech
    'stílus',                            // Hungarian
  ],
  pattern: [
    'pattern',                           // English
    'patroon',                           // Dutch
    'motif',                             // French
    'muster',                            // German
    'pola',                              // Indonesian
    'patrón', 'patron',                  // Spanish
    'modello',                           // Italian
    'padrão', 'padrao',                  // Portuguese
    'mönster',                           // Swedish
    'vzor',                              // Czech
    'minta',                             // Hungarian
  ],
  type: [
    'type',                              // English / French / Dutch
    'typ', 'typ',                        // German / Polish
    'tipo',                              // Spanish / Italian / Portuguese
    'typ',                               // Swedish / Czech
    'típus',                             // Hungarian
  ],
}

// ─── Resolve alias ─────────────────────────────────────────────────────────────
//
// Given an option name string (e.g. "Kleur"), return the canonical SKU keyword
// (e.g. "color") or null if no alias matches.

export function resolveOptionAlias(optionName: string): string | null {
  const normalised = optionName.toLowerCase().trim()
  for (const [keyword, aliases] of Object.entries(OPTION_ALIASES)) {
    if (aliases.includes(normalised)) return keyword
  }
  return null
}

// ─── buildSKU ─────────────────────────────────────────────────────────────────
//
// Standalone SKU builder that works with plain product objects
// (option1_name / option1_value style — as returned by Claude or stored in DB).
// Used as the server-side safety net after Claude's output is parsed.

export interface SkuProduct {
  title?:         string
  vendor?:        string
  type?:          string
  option1_name?:  string
  option1_value?: string
  option2_name?:  string
  option2_value?: string
  option3_name?:  string
  option3_value?: string
}

export function buildSKU(structure: string, product: SkuProduct): string {
  const components = structure.split('-').map(c => c.trim().toLowerCase()).filter(Boolean)
  const parts: string[] = []

  // Build a map: canonical keyword → current option value
  const optionValueByKeyword: Record<string, string> = {}
  for (let n = 1; n <= 3; n++) {
    const name  = product[`option${n}_name`  as keyof SkuProduct] as string | undefined
    const value = product[`option${n}_value` as keyof SkuProduct] as string | undefined
    if (!name || !value) continue

    // Try exact slugify match first
    const slug = slugify(name)
    optionValueByKeyword[slug] = value

    // Try alias match
    const canonical = resolveOptionAlias(name)
    if (canonical) optionValueByKeyword[canonical] = value
  }

  for (const comp of components) {
    let value = ''

    switch (comp) {
      case 'title':
        value = product.title ?? ''
        break
      case 'brand':
      case 'vendor':
        value = product.vendor ?? ''
        break
      case 'type':
        value = product.type ?? ''
        break
      default:
        // Direct map lookup (covers exact slug and resolved aliases)
        value = optionValueByKeyword[comp] ?? ''
        break
    }

    const s = slugify(value)
    if (s) parts.push(s)
  }

  return parts.join('-')
}

// ─── validateAndFixSKUs ───────────────────────────────────────────────────────
//
// Post-processes a batch of Claude output items.
// If Claude returned an invalid SKU or none at all, rebuilds it server-side.

export function validateAndFixSKUs<T extends SkuProduct & { sku?: string }>(
  products: T[],
  skuStructure: string,
): T[] {
  return products.map((product, i) => {
    const serverSKU = buildSKU(skuStructure, product)

    if (!product.sku) {
      if (serverSKU) {
        console.log(`[SKU] Product ${i + 1}: Claude returned no SKU → server built: "${serverSKU}"`)
        return { ...product, sku: serverSKU }
      }
      return product
    }

    // Validate Claude's SKU
    const sku = product.sku
    const hasUppercase   = sku !== sku.toLowerCase()
    const hasSpaces      = sku.includes(' ')
    const hasDoubleHyph  = sku.includes('--')
    const hasBadToken    = sku.includes('undefined') || sku.includes('null') || sku.includes('NaN')

    if (hasUppercase || hasSpaces || hasDoubleHyph || hasBadToken) {
      console.warn(`[SKU] Product ${i + 1}: invalid Claude SKU "${sku}" → server: "${serverSKU}"`)
      return { ...product, sku: serverSKU || sku }
    }

    return product
  })
}
