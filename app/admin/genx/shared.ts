// ── Shared types & styles — separate file to avoid circular imports ──

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
}
export type Community = {
  id: string; name: string; platform: string; url: string | null
  description: string | null; member_count: number; prospect_count: number
  lg_count: number; status: string; tags: string[]; notes: string | null
  created_at: string; updated_at: string
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
  radius: 10,
  radiusSm: 6,
  font: 'Inter, -apple-system, sans-serif',
}
