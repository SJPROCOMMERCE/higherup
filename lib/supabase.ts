import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── Types ────────────────────────────────────────────────────────────────────

export type VA = {
  id: string
  name: string
  email: string | null
  wise_paypal_details: string | null
  status: 'pending_approval' | 'active' | 'paused' | 'blocked' | 'deleted'
  payment_status: 'paid' | 'outstanding' | 'overdue'
  joined_at: string
  referred_by: string | null
  login_code: string | null
  // Onboarding
  full_legal_name: string | null
  country: string | null
  phone_number: string | null
  payment_method: 'wise' | 'paypal' | 'gcash' | 'maya' | 'upi' | 'jazzcash' | 'easypaisa' | 'bkash' | 'bank_transfer' | null
  payment_details: Record<string, string> | null
  preferred_currency: string | null
  onboarding_complete: boolean | null
  agreed_to_terms: boolean | null
  agreed_at: string | null
}

export type Client = {
  // Identity
  id: string
  va_id: string

  // Store info
  store_name: string
  store_domain: string | null

  // Classification
  niche: 'fashion' | 'electronics' | 'home_garden' | 'beauty' | 'health' | 'sports' | 'other' | null
  market: string | null
  language: 'english' | 'german' | 'french' | 'dutch' | 'spanish' | 'polish' | 'portuguese' | 'italian' | 'swedish' | 'danish' | 'norwegian' | 'other' | null

  // Preferences
  expected_monthly_products: number | null
  title_preference: 'short' | 'medium' | 'long' | null
  description_style: 'minimal' | 'standard' | 'detailed' | 'emotional' | 'technical' | 'casual' | 'luxury' | 'neutral' | null
  special_instructions: string | null
  va_client_payment_method: string | null
  va_rate_per_product: number | null

  // Approval
  approval_status: 'pending' | 'approved' | 'rejected'
  rejection_reason: string | null
  approved_at: string | null
  approved_by: string | null

  // 48h rule
  deadline_48h: string | null
  deadline_expired: boolean | null

  // Status
  is_active: boolean
  deactivation_reason: string | null
  deactivated_at: string | null

  // Timestamps
  registered_at: string
  updated_at: string | null

  // Tracking (auto-updated by DB trigger)
  total_uploads: number | null
  total_variants_processed: number | null
  last_upload_at: string | null
  current_month_variants: number | null
  current_month_tier: string | null
  current_month_amount: number | null

  // CSV memory
  last_column_mapping: Record<string, string | null> | null
  detected_as_shopify: boolean | null

  // Admin
  admin_notes: string | null
}

export type Upload = {
  // Identity
  id: string
  va_id: string
  client_id: string
  store_name: string | null

  // File info
  file_type: 'csv' | 'xlsx' | 'manual' | null
  original_filename: string | null
  file_size_bytes: number | null
  sheet_name: string | null
  detected_as_shopify: boolean | null
  input_file_path: string | null
  output_file_path: string | null

  // Product counting
  product_row_count: number | null
  unique_product_count: number | null
  image_row_count: number | null

  // Column mapping
  column_mapping: Record<string, string | null> | null

  // Instructions
  special_instructions: string | null
  pre_check_result: Record<string, unknown> | null
  adjusted_instruction: string | null
  output_columns: string[] | null

  // Image & price settings
  image_settings: Record<string, boolean> | null
  price_rules: Record<string, unknown> | null

  // Status & processing
  status: 'queued' | 'processing' | 'done' | 'failed' | 'on_hold'
  error_message: string | null
  processing_time_seconds: number | null
  processing_started_at: string | null
  processing_completed_at: string | null
  batches_total: number | null
  batches_completed: number | null
  batches_failed: number | null
  products_optimized: number | null
  products_failed: number | null

  // API cost tracking
  api_input_tokens: number | null
  api_output_tokens: number | null
  api_cached_tokens: number | null
  api_cost_usd: number | null
  api_calls_count: number | null

  // Download tracking
  output_downloaded: boolean | null
  output_downloaded_at: string | null
  download_count: number | null

  // Admin (on_hold)
  held_reason: string | null
  released_by: string | null
  released_at: string | null

  // Retry tracking
  retry_count: number | null
  retried_from_upload_id: string | null
  original_upload_id: string | null

  // Output locking (unpaid invoice)
  output_locked: boolean | null
  output_locked_at: string | null
  output_unlocked_at: string | null

  // Timestamps
  uploaded_at: string
  updated_at: string | null
}

export type Billing = {
  // Identity
  id: string
  invoice_number: string | null
  va_id: string
  month: string  // "YYYY-MM"

  // VA snapshot (frozen at generation time)
  va_name: string | null
  va_email: string | null
  va_payment_method: string | null
  va_payment_details: Record<string, string> | null

  // Amounts
  total_variants: number | null
  total_clients: number | null
  total_amount: number
  currency: string | null

  // Status
  status: 'outstanding' | 'paid' | 'overdue' | 'waived'
  due_date: string | null
  generated_at: string
  paid_at: string | null

  // Payment details
  payment_method_used: string | null
  payment_reference: string | null
  payment_amount_received: number | null
  partial_payment_received: number | null
  overpayment: number | null
  wise_transfer_id: string | null

  // Escalation tracking
  reminded_at: string | null
  paused_at: string | null
  blocked_at: string | null

  // Meta
  notes: string | null
  created_by: string | null
  updated_at: string | null
}

export type BillingLineItem = {
  id: string
  billing_id: string
  client_id: string
  store_name: string
  niche: string | null
  variant_count: number
  unique_product_count: number | null
  tier: 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4'
  amount: number
  upload_count: number | null
  first_upload_at: string | null
  last_upload_at: string | null
  created_at: string
}

export type Affiliate = {
  // Relation
  id: string
  referrer_va_id: string
  referred_va_id: string
  referral_code: string | null
  referred_at: string
  is_active: boolean

  // Referred VA info (synced snapshot)
  referred_va_name: string | null
  referred_va_country: string | null
  referred_va_status: string | null
  referred_va_onboarded: boolean | null
  referred_va_first_upload_at: string | null
  referred_va_joined_month: string | null
  free_month_used: boolean | null

  // Payout
  payout_percentage: number | null
  months_active: number | null
  months_paid: number | null
  total_referred_va_paid: number | null
  total_payout_earned: number | null
  current_month_referred_fee: number | null
  current_month_payout_amount: number | null
  current_month_referred_paid: boolean | null
  last_payout_at: string | null

  // Meta
  notes: string | null
  updated_at: string | null
}

export type ReferralCode = {
  id: string
  va_id: string
  code: string
  link: string
  total_referrals: number | null
  active_referrals: number | null
  total_earned: number | null
  current_month_earned: number | null
  created_at: string
  // Streak multiplier
  payment_streak: number | null
  current_percentage: number | null
  highest_streak: number | null
  streak_lost_count: number | null
  next_tier_at: number | null
  potential_monthly_earnings: number | null
  actual_monthly_earnings: number | null
  last_streak_reset_month: string | null
  streak_last_updated_month: string | null
}

export type AffiliatePayout = {
  id: string
  referrer_va_id: string
  affiliate_id: string
  referred_va_id: string
  month: string
  referred_va_fee: number
  payout_percentage: number
  payout_amount: number
  status: 'pending' | 'paid' | 'skipped' | 'waived'
  reason_skipped: string | null
  is_free_month: boolean | null
  paid_at: string | null
  payment_reference: string | null
  created_at: string
}

export type ProfileChangeRequest = {
  id: string
  va_id: string
  client_id: string
  request_text: string
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
}

export type Prompt = {
  // Identity
  id: string
  name: string
  description: string | null
  niche: string | null
  niche_col: string | null
  language: string | null
  market: string | null
  version: number
  is_active: boolean | null
  is_default: boolean | null
  slug: string | null
  change_notes: string | null
  parent_id: string | null

  // Prompt content — "prompt" columns are the full prompt documents;
  // "instructions" columns are supplementary field-specific rules.
  // prompt-builder reads title_prompt first, falls back to title_instructions.
  system_prompt: string | null
  title_prompt: string | null
  title_instructions: string | null
  description_prompt: string | null
  description_instructions: string | null
  seo_instructions: string | null
  seo_title_instructions: string | null
  seo_description_instructions: string | null
  formatting_rules: string | null
  alt_text_instructions: string | null
  filename_instructions: string | null
  tags_instructions: string | null
  price_rules_instructions: string | null

  // Examples & tone
  tone_of_voice: string | null
  tone_examples: string | null
  title_examples: string | null
  description_examples: string | null

  // Usage tracking (may not exist in all DB versions)
  usage_count: number | null
  last_used_at: string | null

  // SKU
  sku_structure: string | null

  // Quality controls
  forbidden_words: string | null
  required_keywords: string | null
  max_title_length: number | null
  max_description_length: number | null
  allow_html: boolean | null
  allow_emoji: boolean | null

  // Timestamps & authorship
  created_at: string
  updated_at: string
  created_by: string | null
}

export type PromptVersion = {
  id: string
  prompt_id: string
  version: number
  system_prompt: string | null
  title_instructions: string | null
  description_instructions: string | null
  seo_instructions: string | null
  tags_instructions: string | null
  formatting_rules: string | null
  changed_by: string | null
  change_notes: string | null
  created_at: string
}

export type CustomData = {
  maxDiscount: string
  competitorPriceDiff: string
  priceEnding: string        // '.99' | '.95' | '.90' | '.00' | 'none' | ''
  pricingBasis: string       // 'compare_at' | 'manual' | ''
  platform: string
  titlePrompt: string
  descriptionPrompt: string
  skuStructure: string
  avgStock: string
  collections: string
  additionalNotes: string
}

export type ClientProfile = {
  id: string
  client_id: string
  prompt_id: string | null
  custom_requirements: boolean | null
  custom_data: CustomData | null
  // Pricing columns (set from custom_data at registration time)
  max_discount: number | null
  competitor_price_diff: number | null
  price_ending: string | null
  pricing_basis: string | null
  updated_at: string
  updated_by: string | null
}

export type Notification = {
  id: string
  va_id: string
  type: '48h_expired' | 'client_approved' | 'client_rejected' | 'upload_done' | 'upload_failed' | 'invoice_generated' | 'invoice_overdue' | 'output_locked' | 'request_approved' | 'request_rejected' | 'account_approved' | 'account_rejected' | 'account_paused' | 'account_blocked' | 'payment_received' | 'streak_lost' | 'streak_extended' | 'streak_reminder' | 'upload_clarification' | 'va_response' | 'account_reactivated'
  title: string
  message: string | null
  is_read: boolean
  created_at: string
}

export type PromptRequest = {
  id: string
  client_id: string
  va_id: string
  message: string | null
  file_urls: string[]
  file_names: string[]
  file_paths?: string[]
  structured_data?: Record<string, unknown> | null
  linked_prompt_id?: string | null
  status: 'submitted' | 'reviewed' | 'applied' | 'rejected'
  admin_response: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  applied_at: string | null
  created_at: string
  updated_at: string
}
