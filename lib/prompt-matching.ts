// ─── Prompt matching — smart recommendation engine ────────────────────────────
// Priority order for recommendation:
//  1. Exact match:          same niche + same language
//  2. Niche fallback:       same niche + English (when no template for that language)
//  3. Language fallback:    General/other + same language
//  4. General fallback:     General/other + English
//  5. Default template:     is_default = true
//
// Used by:
//  - /admin/clients  — approval flow and "Change template" panel
//  - lib/prompt-builder.ts — server-side (imported from supabase types)

import type { Prompt } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MatchType = 'exact' | 'niche_fallback' | 'language_fallback' | 'general_fallback'

export type PromptRecommendation = {
  prompt: Prompt
  matchType: MatchType
  reason: string
}

// ─── Client-side: works with already-loaded prompts list ──────────────────────

export function getRecommendedPromptFromList(
  prompts: Prompt[],
  niche: string | null,
  language: string | null,
): PromptRecommendation | null {
  const active = prompts.filter(p => p.is_active)

  // 1. Exact match
  const exact = active.find(p => p.niche === niche && p.language === language)
  if (exact) {
    return {
      prompt: exact,
      matchType: 'exact',
      reason: `Exact match for ${niche} + ${language}`,
    }
  }

  // 2. Niche + English fallback
  if (language && language !== 'english') {
    const nicheEn = active.find(p => p.niche === niche && p.language === 'english')
    if (nicheEn) {
      return {
        prompt: nicheEn,
        matchType: 'niche_fallback',
        reason: `Niche match. No ${language} template available, using English.`,
      }
    }
  }

  // 3. General + same language
  const genLang = active.find(p => (p.niche === 'other' || p.niche === 'general') && p.language === language)
  if (genLang) {
    return {
      prompt: genLang,
      matchType: 'language_fallback',
      reason: `Language match. No ${niche} template, using General.`,
    }
  }

  // 4. General + English
  const genEn = active.find(p => (p.niche === 'other' || p.niche === 'general') && p.language === 'english')
  if (genEn) {
    return {
      prompt: genEn,
      matchType: 'general_fallback',
      reason: 'No matching template. Using General — English fallback.',
    }
  }

  // 5. Default template
  const def = active.find(p => p.is_default)
  if (def) {
    return {
      prompt: def,
      matchType: 'general_fallback',
      reason: 'Using default template (no matching template found).',
    }
  }

  return null
}

// ─── Match type explanation colours ──────────────────────────────────────────

export function matchTypeColor(type: MatchType): string {
  switch (type) {
    case 'exact':            return '#2DB87E'
    case 'niche_fallback':   return '#F59E0B'
    case 'language_fallback': return '#F59E0B'
    case 'general_fallback': return '#999999'
  }
}
