// ─── Prompt builder — layers system ───────────────────────────────────────────
// Layer 1: system_prompt  (from DB template)
// Layer 2: title_prompt   (from DB template — default or client-linked)
// Layer 3: description_prompt (from DB template)
// Layer 4: client-specific context (title length, description depth, standing instructions)
// Layer 5: upload-specific special instructions

import { supabase } from '@/lib/supabase'

// ─── Layer 4 translation maps ─────────────────────────────────────────────────

const TITLE_PREF_MAP: Record<string, string> = {
  short:  'Keep titles under 60 characters. Use only the 2-3 most critical search keywords.',
  medium: 'Aim for 60-100 characters. Balance keyword density with readability.',
  long:   'Use up to 150 characters. Include more descriptive and long-tail keywords.',
}

const DESC_DEPTH_MAP: Record<string, string> = {
  minimal:  'Write a minimal description: 1 opening sentence followed by exactly 3 bullet points.',
  standard: 'Write a standard description: 1 opening sentence followed by 4-5 bullet points.',
  detailed: 'Write a detailed description: 2 opening sentences followed by 5-6 bullet points with additional specifics.',
  // Legacy values — backward compatible
  emotional:  'Use an emotional, engaging tone that connects with the reader.',
  technical:  'Use a technical, specification-focused tone.',
  casual:     'Use a casual, friendly tone.',
  luxury:     'Use a premium, luxury tone focused on quality and exclusivity.',
  neutral:    'Use a neutral, factual tone.',
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PromptRow = Record<string, string | number | boolean | null>

// ─── Main builder ─────────────────────────────────────────────────────────────

export async function buildPrompt(
  clientId:            string,
  specialInstructions?: string | null,
  imageEnabled?:       boolean,
  overridePromptId?:   string | null,
): Promise<{ system: string; title: string; description: string; skuStructure: string }> {

  // ── 1. Load client + profile ───────────────────────────────────────────────
  const [{ data: clientRaw }, { data: clientPromptRows }] = await Promise.all([
    supabase.from('clients').select('*, client_profiles(*)').eq('id', clientId).single(),
    supabase.from('client_prompts').select('prompt_id').eq('client_id', clientId).order('assigned_at').limit(1),
  ])

  const client = clientRaw as Record<string, unknown> | null

  // ── 2. Resolve prompt ID — override > client_prompts > legacy client_profiles ──
  const profileRaw = client?.client_profiles
  const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw
  const legacyProfilePromptId = (profile as Record<string, unknown> | null)?.prompt_id as string | null | undefined
  const assignedPromptId = (clientPromptRows ?? [])[0]?.prompt_id ?? legacyProfilePromptId
  const promptId = overridePromptId ?? assignedPromptId

  console.log(`[prompt-builder] client=${clientId} overridePromptId=${overridePromptId ?? 'none'} assignedPromptId=${assignedPromptId ?? 'none'} → resolving promptId=${promptId ?? 'none'}`)

  // ── 3. Load linked prompt template ────────────────────────────────────────
  let prompt: PromptRow | null = null

  if (promptId) {
    const { data } = await supabase
      .from('prompts')
      .select('*')
      .eq('id', promptId)
      .single()
    const linked = data as PromptRow | null
    if (linked?.is_active) {
      prompt = linked
      console.log(`[prompt-builder] loaded assigned template: "${linked.name}" (${promptId}) | sys=${String(linked.system_prompt ?? '').length}chars title=${String(linked.title_prompt ?? linked.title_instructions ?? '').length}chars desc=${String(linked.description_prompt ?? linked.description_instructions ?? '').length}chars`)
    } else if (linked && !linked.is_active) {
      console.warn(`[prompt-builder] template "${linked.name}" (${promptId}) is inactive → falling back to default`)
    } else {
      console.warn(`[prompt-builder] template ${promptId} not found in DB → falling back to default`)
    }
  }

  // ── 3b. Auto-create client_profiles record if missing ─────────────────────
  if (!profile && client) {
    await supabase.from('client_profiles').upsert(
      { client_id: clientId, prompt_id: null },
      { onConflict: 'client_id', ignoreDuplicates: true },
    )
  }

  // ── 4. Fall back to default active template ───────────────────────────────
  if (!prompt) {
    console.log(`[prompt-builder] no assigned template — querying for is_default=true is_active=true`)
    const { data, error: defaultErr } = await supabase
      .from('prompts')
      .select('*')
      .eq('is_default', true)
      .eq('is_active', true)
      .limit(1)
      .single()
    prompt = data as PromptRow | null
    if (prompt) {
      console.log(`[prompt-builder] using default template: "${prompt.name}" (${prompt.id}) | sys=${String(prompt.system_prompt ?? '').length}chars title=${String(prompt.title_prompt ?? prompt.title_instructions ?? '').length}chars desc=${String(prompt.description_prompt ?? prompt.description_instructions ?? '').length}chars`)
    } else {
      console.error(`[prompt-builder] NO default template found (is_default=true is_active=true) — error: ${defaultErr?.message}. Using hard fallback. CHECK: does any prompt row have is_default=true AND is_active=true?`)
    }
  }

  // ── 5. Hard fallback if DB has no active default prompt ──────────────────
  // This fallback must be meaningful enough to produce real optimization,
  // not just a generic sentence that results in unchanged output.
  const fallbackSystem = [
    'You are an expert e-commerce product listing optimizer.',
    'Your job: rewrite product listings to maximize conversion and search visibility on Google Shopping.',
    '',
    '## TITLE RULES',
    'Write SEO-optimized titles. Structure: [Brand] + [Product Type] + [Key Feature] + [Material/Color/Size if relevant].',
    'Be descriptive and use terms shoppers actually search for. Max 80 characters.',
    '',
    '## DESCRIPTION RULES',
    'Write compelling product descriptions. Include: what it is, key features, material/specs, who it is for.',
    'Use short paragraphs. Between 100-200 words. Professional e-commerce tone.',
    '',
    'Output valid JSON only. No markdown, no explanations.',
  ].join('\n')

  // ── 6. Build system prompt ────────────────────────────────────────────────
  const parts: string[] = []
  let resolvedSkuStructure = String(prompt?.sku_structure ?? '').trim() || 'title-size-color'

  parts.push(String(prompt?.system_prompt ?? '').trim() || fallbackSystem)

  // Layer 4: client-specific context
  if (client) {
    const titlePref     = String(client.title_preference  ?? 'medium')
    const descDepth     = String(client.description_style ?? 'standard')
    const standing      = String(client.special_instructions ?? '').trim()
    const storeName     = String(client.store_name ?? '')
    const niche         = String(client.niche      ?? 'general')
    const market        = String(client.market     ?? 'international')
    const language      = String(client.language   ?? 'english').toLowerCase().trim()
    // Fallback chain: client override → template default → global default
    resolvedSkuStructure = (
      String(client.sku_structure ?? '').trim() ||
      String(prompt?.sku_structure ?? '').trim() ||
      'title-size-color'
    )
    const skuStructure = resolvedSkuStructure
    const isTranslation = language !== 'english' && language !== 'en' && language !== ''

    parts.push(
      `\n## CLIENT CONTEXT` +
      `\n- Store: ${storeName}` +
      `\n- Niche: ${niche}` +
      `\n- Market: ${market}` +
      `\n- Language: ${language}`
    )

    if (TITLE_PREF_MAP[titlePref]) {
      parts.push(`- Title length: ${TITLE_PREF_MAP[titlePref]}`)
    }
    if (DESC_DEPTH_MAP[descDepth]) {
      parts.push(`- Description depth: ${DESC_DEPTH_MAP[descDepth]}`)
    }

    // Translation rules (when output language is not English)
    if (isTranslation) {
      parts.push(`
## TRANSLATION RULES

Target language: ${language}

Translate ALL of the following into ${language}:
- Product title
- Product description
- Variant option NAMES (e.g. "Color" → ${language} word, "Size" → ${language} word, "Material" → ${language} word)
- Variant option VALUES (e.g. "Red" → translated, "Small" → translated, "Cotton" → translated)
- Alt text (if present)
- Tags (if human-readable words, NOT codes)

Do NOT translate:
- Handles (URL slugs — keep exactly as-is)
- Image URLs
- Brand names (keep original unless client specifies otherwise)
- Barcodes / product codes / numeric codes
- SKUs (these are rebuilt AFTER translation — see SKU RULES below)

Translation quality:
- Write like a native ${language} speaker. Not machine translation.
- Use terms that shoppers in the target market actually search for.
- Do NOT mix languages. If target is ${language}, EVERYTHING must be ${language} (except brand names).
- Size terms: translate to the local convention (e.g. "Small" → local word, not always "S").

In your JSON response, include "option_translations" for every product that has variants:
[
  {
    "name": "Color",
    "translated_name": "${language}-word-for-Color",
    "values": [{ "original": "Red", "translated": "${language}-word-for-Red" }]
  }
]
If the product has no variants, return "option_translations": [].`)
    }

    // SKU rules — always present (skuStructure has a global default)
    const skuComponents = skuStructure.split('-').filter(Boolean)
    const skuExplained = skuComponents.map((part: string) => {
      switch (part.toLowerCase()) {
        case 'title':    return `  - "title" → translated product title`
        case 'size':     return `  - "size" → translated size option value (Option Name: Size, Maat, Taille, etc.)`
        case 'color':    return `  - "color" → translated color option value (Option Name: Color, Kleur, Couleur, etc.)`
        case 'material': return `  - "material" → translated material option value`
        case 'brand':    return `  - "brand" → Vendor/Brand name (do NOT translate brand names)`
        case 'type':     return `  - "type" → translated product type`
        default:         return `  - "${part}" → translated value of the "${part}" option`
      }
    }).join('\n')
    parts.push(`
## SKU RULES

SKU structure: "${skuStructure}"

Components:
${skuExplained}

The system builds per-variant SKUs automatically from your option_translations output.
You do NOT need to return a "sku" field. Just ensure option_translations is complete.
Format: lowercase, spaces → hyphens, no special characters, no double hyphens, skip empty components.

Example (structure "title-size-color", target Dutch):
  Input: Title="Blue Cotton Shirt", Size="Small", Color="Blue"
  Your output option_translations: [
    { "name": "Size", "translated_name": "Maat", "values": [{ "original": "Small", "translated": "Klein" }] },
    { "name": "Color", "translated_name": "Kleur", "values": [{ "original": "Blue", "translated": "Blauw" }] }
  ]
  System builds SKU: "blauw-katoenen-shirt-klein-blauw"`)


    // Standing instructions (VA-editable per client, applied to every upload)
    if (standing) {
      parts.push(`\n## STANDING INSTRUCTIONS\n${standing}`)
    }

    // {{variable}} substitution from profile
    const promptVars = (profile as Record<string, unknown> | null)?.prompt_variables as Record<string, string> | null | undefined
    if (promptVars && typeof promptVars === 'object') {
      const raw = parts.join('\n')
      const substituted = raw.replace(
        /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g,
        (_match, name: string) => promptVars[name] ?? _match,
      )
      // Rebuild parts from substituted string — simpler than tracking per-part
      parts.length = 0
      parts.push(substituted)
    }
  }

  // Layer 4: image instructions (if upload uses image processing)
  if (imageEnabled) {
    const altText  = String(prompt?.alt_text_instructions  ?? '').trim()
    const filename = String(prompt?.filename_instructions   ?? '').trim()
    if (altText)  parts.push(`\n## IMAGE ALT TEXT INSTRUCTIONS\n${altText}`)
    if (filename) parts.push(`\n## IMAGE FILENAME INSTRUCTIONS\n${filename}`)
  }

  // Layer 5: upload-specific special instructions
  if (specialInstructions?.trim()) {
    parts.push(`\n## SPECIAL INSTRUCTIONS FOR THIS UPLOAD\n${specialInstructions.trim()}`)
  }

  const system = parts.join('\n')

  // ── 7. Title + description prompts ────────────────────────────────────────
  // Prefer new title_prompt / description_prompt columns, fall back to legacy
  const title = String(
    prompt?.title_prompt           ??
    prompt?.title_instructions     ??
    ''
  ).trim()

  const description = String(
    prompt?.description_prompt        ??
    prompt?.description_instructions  ??
    ''
  ).trim()

  return { system, title, description, skuStructure: resolvedSkuStructure }
}
