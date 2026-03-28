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
): Promise<{ system: string; title: string; description: string }> {

  // ── 1. Load client + profile ───────────────────────────────────────────────
  const { data: clientRaw } = await supabase
    .from('clients')
    .select('*, client_profiles(*)')
    .eq('id', clientId)
    .single()

  const client = clientRaw as Record<string, unknown> | null

  // ── 2. Resolve prompt ID from profile ─────────────────────────────────────
  const profileRaw = client?.client_profiles
  const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw
  const promptId  = (profile as Record<string, unknown> | null)?.prompt_id as string | null | undefined

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
    const titlePref  = String(client.title_preference  ?? 'medium')
    const descDepth  = String(client.description_style ?? 'standard')
    const standing   = String(client.special_instructions ?? '').trim()
    const storeName  = String(client.store_name ?? '')
    const niche      = String(client.niche      ?? 'general')
    const market     = String(client.market     ?? 'international')
    const language   = String(client.language   ?? 'English')

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
