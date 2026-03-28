// ─── 6-digit VA login code generator ─────────────────────────────────────────
// Generates unique 6-digit codes (100000–999999) for VA login.
// No leading zeros. Guaranteed unique via DB uniqueness check.

import { supabase } from '@/lib/supabase'

export async function generateUniqueLoginCode(): Promise<string> {
  let attempts = 0

  while (attempts < 10) {
    // 100000–999999 (6 digits, no leading zeros)
    const code = Math.floor(100_000 + Math.random() * 900_000).toString()

    const { data: existing } = await supabase
      .from('vas')
      .select('id')
      .eq('login_code', code)
      .limit(1)

    if (!existing || existing.length === 0) {
      return code
    }

    attempts++
  }

  throw new Error('Could not generate unique login code after 10 attempts')
}
