// ── Shared types, styles & pipeline constants — separate file to avoid circular imports ──

// ── Pipeline Stages ──
export const PIPELINE_STAGES = [
  { key: 'identified', label: 'Identified', color: '#6B7280' },
  { key: 'contacted', label: 'Contacted', color: '#2563EB' },
  { key: 'replied', label: 'Replied', color: '#06B6D4' },
  { key: 'interested', label: 'Interested', color: '#7C3AED' },
  { key: 'pitch_sent', label: 'Pitch Sent', color: '#8B5CF6' },
  { key: 'call_scheduled', label: 'Call Scheduled', color: '#EA580C' },
  { key: 'call_done', label: 'Call Done', color: '#D97706' },
  { key: 'signed_up', label: 'Signed Up', color: '#059669' },
  { key: 'onboarding', label: 'Onboarding', color: '#0891B2' },
  { key: 'active_lg', label: 'Active LG', color: '#16A34A' },
] as const

export const TERMINAL_STAGES = [
  { key: 'declined', label: 'Declined', color: '#DC2626' },
  { key: 'lost', label: 'Lost', color: '#9CA3AF' },
  { key: 'revisit_later', label: 'Revisit Later', color: '#D97706' },
] as const

export const ALL_STAGES = [...PIPELINE_STAGES, ...TERMINAL_STAGES]

// Map stage key → timestamp column name
export const STAGE_TIMESTAMP_KEY: Record<string, string> = {
  identified: 'identified_at', contacted: 'contacted_at', replied: 'replied_at',
  interested: 'interested_at', pitch_sent: 'pitch_sent_at', call_scheduled: 'call_scheduled_at',
  call_done: 'call_done_at', signed_up: 'signed_up_at', onboarding: 'onboarding_at',
  active_lg: 'active_lg_at', declined: 'declined_at', revisit_later: 'revisit_later_at',
}

// ── Types ──
export type LG = {
  id: string; display_name: string; email: string | null; login_code: string
  referral_code: string; status: string; total_earned: number; total_vas: number
  active_vas: number; referral_count: number; joined_at: string | null
  onboarding_status: string | null; lg_tier: string | null; community_id: string | null
  recruiter_notes: string | null; last_active_at: string | null
}
export type Prospect = {
  id: string; name: string; email: string | null; phone: string | null
  platform: string | null; handle: string | null; source: string; stage: string
  stage_index: number; priority: string; follow_up_date: string | null
  lost_reason: string | null; converted_lg_id: string | null; notes: string | null
  tags: string[]; created_at: string; updated_at: string; converted_at: string | null
  admin_communities?: { name: string } | null
  // Stage timestamps
  identified_at: string | null; contacted_at: string | null; replied_at: string | null
  interested_at: string | null; pitch_sent_at: string | null; call_scheduled_at: string | null
  call_done_at: string | null; signed_up_at: string | null; onboarding_at: string | null
  active_lg_at: string | null; declined_at: string | null; revisit_later_at: string | null
}
export type Community = {
  id: string; name: string; platform: string; url: string | null
  description: string | null; member_count: number; status: string
  tags: string[]; notes: string | null; created_at: string; updated_at: string
  quality_rating: number; priority: string
  admin_name: string | null; admin_handle: string | null
  admin_contacted: boolean; admin_notes: string | null
  we_are_member: boolean; joined_date: string | null
  posts_made: number; last_posted_at: string | null
  vas_from_here: number; total_products_from_here: number
  revenue_from_here: number; lg_earnings_from_here: number
  active_lgs: string[]
}
export type Scorecard = {
  id: string; score_date: string; calls_made: number; dms_sent: number
  emails_sent: number; prospects_added: number; follow_ups_done: number
  appointments_set: number; conversions: number; communities_posted: number
  notes: string | null
}
export type Payout = { id: string; lg_id: string; period_start: string; amount: number; status: string }
export type ProspectActivity = {
  id: string; prospect_id: string; activity_type: string; description: string | null
  old_stage: string | null; new_stage: string | null; created_at: string
  admin_prospects?: { name: string } | null
}

export type FunnelStep = {
  stage: string; label: string; color: string; count: number
  rate_from_previous: number | null; avg_hours: number | null
}
export type FunnelData = {
  steps: FunnelStep[]
  overall_rate: number
  bottleneck: { stage: string; drop_off_percent: number; message: string } | null
  stuck: Record<string, number>
}

// ── Styles ──
export const S = {
  bg: '#FFFFFF',
  surface: '#F9FAFB',
  surfaceHover: '#F3F4F6',
  border: '#E5E7EB',
  borderLight: '#F0F0F0',
  text: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  accent: '#2563EB',
  accentLight: '#EFF6FF',
  green: '#059669',
  greenLight: '#ECFDF5',
  red: '#DC2626',
  redLight: '#FEF2F2',
  yellow: '#D97706',
  yellowLight: '#FFFBEB',
  purple: '#7C3AED',
  purpleLight: '#F5F3FF',
  orange: '#EA580C',
  orangeLight: '#FFF7ED',
  cyan: '#0891B2',
  radius: 10,
  radiusSm: 6,
  font: 'Inter, -apple-system, sans-serif',
}
