/**
 * GENX server-side DB client — uses service role key to bypass RLS.
 * Only import this in API routes and server components, NEVER in client components.
 */
import { createClient } from '@supabase/supabase-js'

export function genxDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
