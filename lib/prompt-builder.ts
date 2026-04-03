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
): Promise<{ system: string; title: string; description: string }> {

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
      // Template is active — use it
      prompt = linked
    } else if (linked && !linked.is_active) {
      // Template has been deactivated — fall through to default
      console.warn(`[prompt-builder] Template "${linked.name}" (${promptId}) for client ${clientId} is inactive. Falling back to default.`)
    }
  }

  // ── 3b. Auto-create client_profiles record if missing ─────────────────────
  if (!profile && client) {
    // Ensure a profile record exists (with null prompt_id = use default)
    await supabase.from('client_profiles').upsert(
      { client_id: clientId, prompt_id: null },
      { onConflict: 'client_id', ignoreDuplicates: true },
    )
  }

  // ── 4. Fall back to default active template ───────────────────────────────
  if (!prompt) {
    const { data } = await supabase
      .from('prompts')
      .select('*')
      .eq('is_default', true)
      .eq('is_active', true)
      .limit(1)
      .single()
    prompt = data as PromptRow | null
  }

  // ── 5. Hard fallback if DB has no prompts at all ──────────────────────────
  const fallbackSystem = 'You are an expert e-commerce product listing optimizer. Rewrite product listings to maximize conversion and search visibility on Google Shopping. Output valid JSON only. No explanations.'

  // ── 6. Build system prompt ────────────────────────────────────────────────
  const parts: string[] = []

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
    const skuStructure  = String(client.sku_structure ?? '').trim()
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

    // SKU rules
    if (skuStructure) {
      parts.push(`
## SKU RULES

SKU structure used by this client: "${skuStructure}"

CRITICAL ORDER — do NOT build SKUs until all translations are done:
1. Translate title → get translated title
2. Translate all option names and values → get translated variants
3. ONLY THEN: build the SKU from the TRANSLATED values

The system will build per-variant SKUs automatically from your translations.
You do NOT need to return a "sku" field — just make sure option_translations are accurate.`)
    } else {
      parts.push(`
## SKU RULES

Do NOT change or generate SKUs. Return sku fields exactly as they are in the input.
If the input has no SKU, leave it empty.`)
    }

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

  return { system, title, description }
}
