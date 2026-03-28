import { supabase } from '@/lib/supabase'

const TABLES = [
  'vas', 'clients', 'uploads', 'billing', 'billing_line_items',
  'affiliates', 'referral_codes', 'affiliate_payouts', 'notifications',
  'activity_log', 'client_profiles', 'prompts', 'prompt_versions',
  'profile_change_requests', 'upload_messages', 'invites', 'pricing_tiers',
]

const ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'ANTHROPIC_API_KEY',
  'NEXT_PUBLIC_APP_URL',
  'CRON_SECRET',
]

const OPTIONAL_ENV_VARS = [
  'WISE_API_KEY',
  'WISE_PROFILE_ID',
]

export async function GET() {
  // Check env vars
  const envChecks = ENV_VARS.map(key => ({
    key,
    ok: !!process.env[key],
    required: true,
  }))
  const optionalEnvChecks = OPTIONAL_ENV_VARS.map(key => ({
    key,
    ok: !!process.env[key],
    required: false,
  }))

  // Check tables
  const tableChecks = await Promise.all(
    TABLES.map(async table => {
      const { error } = await supabase.from(table).select('id').limit(1)
      return { table, ok: !error, error: error?.message ?? null }
    })
  )

  const allOk = envChecks.every(c => c.ok) && tableChecks.every(c => c.ok)

  return Response.json(
    {
      status: allOk ? 'healthy' : 'unhealthy',
      env: [...envChecks, ...optionalEnvChecks],
      tables: tableChecks,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  )
}
