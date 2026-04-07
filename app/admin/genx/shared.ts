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
  // Response speed
  last_replied_at: string | null; our_response_at: string | null
  has_unreplied: boolean; last_response_time_minutes: number | null
  // Loss reason tracking
  loss_reason: string | null; loss_reason_detail: string | null
  lost_at: string | null; lost_by: string | null
  times_lost: number; revisit_at: string | null
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
  // Response speed fields
  sender?: string | null; direction?: string | null
  channel_used?: string | null; response_time_minutes?: number | null
}

export type ResponseSpeedData = {
  unreplied: {
    count: number
    prospects: { id: string; name: string; channel: string | null; waiting_minutes: number; waiting_display: string }[]
  }
  speed_stats: {
    avg_minutes: number; avg_display: string; total_replies: number
    within_5min: number; within_5min_pct: number
    within_1hr: number; within_1hr_pct: number
    within_24hr: number; within_24hr_pct: number
    expired_count: number
  }
  per_person: Record<string, { avg_minutes: number; count: number }>
  trend: { week: string; avg_minutes: number; count: number }[]
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

// ── Loss Reasons ──
export const LOSS_REASONS = [
  { id: 'wants_fixed_fee', label: 'Wants a fixed monthly fee', category: 'pricing', revisitDays: 60 },
  { id: 'thinks_scam', label: 'Thinks it is a scam', category: 'trust', revisitDays: 90 },
  { id: 'thinks_mlm', label: 'Thinks it is MLM', category: 'trust', revisitDays: 90 },
  { id: 'no_network', label: 'Has no VA network', category: 'qualification', revisitDays: 0 },
  { id: 'no_time', label: 'No time to recruit', category: 'commitment', revisitDays: 30 },
  { id: 'no_reply_5plus', label: 'No reply after 5+ attempts', category: 'engagement', revisitDays: 60 },
  { id: 'no_reply_initial', label: 'No reply to first message', category: 'engagement', revisitDays: 30 },
  { id: 'uses_competitor', label: 'Already uses a competitor', category: 'competition', revisitDays: 90 },
  { id: 'not_interested_listing', label: 'Not interested in listing work', category: 'qualification', revisitDays: 0 },
  { id: 'too_complicated', label: 'Thinks it is too complicated', category: 'education', revisitDays: 30 },
  { id: 'bad_timing', label: 'Bad timing (vacation, busy, personal)', category: 'timing', revisitDays: 14 },
  { id: 'other', label: 'Other (specify below)', category: 'other', revisitDays: 30 },
] as const

export const LOSS_CATEGORY_COLORS: Record<string, string> = {
  pricing: '#D97706', trust: '#DC2626', qualification: '#6B7280',
  commitment: '#EA580C', engagement: '#2563EB', competition: '#7C3AED',
  education: '#4F46E5', timing: '#059669', other: '#9CA3AF',
}

export function getLossReasonLabel(id: string): string {
  return LOSS_REASONS.find(r => r.id === id)?.label || id
}

export type LossHistoryEntry = {
  id: string; prospect_id: string; lost_at: string; lost_by: string
  loss_reason: string; loss_reason_detail: string | null
  stage_before: string | null; days_in_pipeline: number | null
  channel: string | null; reactivated_at: string | null; reactivated_by: string | null
}

export type LossAnalyticsData = {
  total_lost: number
  reasons: { reason: string; label: string; count: number; percentage: number }[]
  top_reason: { reason: string; label: string; count: number; percentage: number } | null
  by_channel: Record<string, Record<string, number>>
  avg_days_in_pipeline: number
  recommendations: string[]
  weekly_trend: { week: string; count: number }[]
  reactivation_due: {
    id: string; name: string; loss_reason: string; lost_at: string
    revisit_at: string; times_lost: number; days_since_lost: number
    loss_reason_label: string; platform: string | null
  }[]
}

// ── Reactivation Pipeline ──
export type ReactivationCycle = {
  id: string; prospect_id: string
  loss_history_id: string | null
  scheduled_at: string; reason_for_revisit: string
  script_to_use: string | null; custom_message: string | null
  status: string; executed_at: string | null; executed_by: string | null
  result_note: string | null; new_pipeline_status: string | null
  created_at: string
  // Joined prospect fields
  prospect_name?: string; prospect_platform?: string | null
  prospect_handle?: string | null; prospect_loss_reason?: string | null
  prospect_times_lost?: number; prospect_times_reactivated?: number
  days_overdue?: number; days_until?: number
}

export type ReactivationTemplate = {
  id: string; loss_reason: string; title: string; content: string
  description: string | null; best_channel: string | null
  expected_reply_rate: string | null; days_after_loss: number
  sort_order: number; is_active: boolean
}

export type ReactivationData = {
  due_now: { count: number; cycles: ReactivationCycle[] }
  upcoming: { count: number; cycles: ReactivationCycle[] }
  stats: {
    sent_last_30_days: number; converted: number
    declined_again: number; conversion_rate: number
    converted_by_reason: Record<string, number>
  }
  recent_results: ReactivationCycle[]
  platform_stats: { active_lgs: number; top_earner_amount: string }
}

export const REACTIVATION_REASONS = [
  { id: 'scheduled_auto', label: 'Auto-scheduled (loss reason)' },
  { id: 'scheduled_manual', label: 'Manually scheduled' },
  { id: 'milestone_reached', label: 'HigherUp milestone reached' },
  { id: 'new_feature', label: 'New feature launched' },
  { id: 'seasonal', label: 'Seasonal (new year, Q1, etc.)' },
  { id: 'competitor_change', label: 'Competitor changed or stopped' },
] as const

// ── Script Tracking ──
export type OutreachScript = {
  id: string; category: string; channel: string; target_prospect_type: string
  title: string; content: string; description: string | null
  times_used: number; times_replied: number; times_converted: number
  reply_rate: number; conversion_rate: number
  created_by: string | null; is_default: boolean; is_active: boolean
  sort_order: number; created_at: string; updated_at: string
  performance_30d?: { total: number; replied: number; converted: number }
}

export type ScriptAnalyticsData = {
  scripts: OutreachScript[]
  best_by_prospect_type: Record<string, { script_id: string; script_title: string; rate: number; total: number }>
  best_by_channel: Record<string, { script_id: string; script_title: string; rate: number; total: number }>
  person_performance: { person: string; total: number; replied: number; reply_rate: number; best_script: string | null; best_rate: number }[]
  recommendations: string[]
}

export const SCRIPT_CATEGORIES = [
  { key: 'first_contact', label: 'First Contact' },
  { key: 'follow_up', label: 'Follow Up' },
  { key: 'objection_handling', label: 'Objection Handling' },
  { key: 'closing', label: 'Closing' },
  { key: 'reactivation', label: 'Reactivation' },
  { key: 'community_post', label: 'Community Post' },
  { key: 'call_intro', label: 'Call Intro' },
  { key: 'custom', label: 'Custom' },
] as const

export const PROSPECT_TYPES = [
  { key: 'any', label: 'Any' },
  { key: 'individual', label: 'Individual VA' },
  { key: 'agency_owner', label: 'Agency Owner' },
  { key: 'community_leader', label: 'Community Leader' },
  { key: 'content_creator', label: 'Content Creator' },
] as const

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
