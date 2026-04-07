'use client'
import { useState } from 'react'
import DashboardTab from './tabs/DashboardTab'
import ProspectsTab from './tabs/ProspectsTab'
import LGsTab from './tabs/LGsTab'
import CommunitiesTab from './tabs/CommunitiesTab'
import ScorecardTab from './tabs/ScorecardTab'

// ── Shared types ──
export type LG = {
  id: string; display_name: string; email: string | null; login_code: string
  referral_code: string; status: string; total_earnings: number; total_referred: number
  active_referred: number; created_at: string; approved_at: string | null
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

// ── Shared styles (light/white admin theme) ──
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

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'prospects', label: 'Prospects' },
  { key: 'lgs', label: 'Lead Generators' },
  { key: 'communities', label: 'Communities' },
  { key: 'scorecard', label: 'Scorecard' },
] as const

type TabKey = typeof TABS[number]['key']

type Props = {
  lgs: LG[]
  prospects: Prospect[]
  communities: Community[]
  scorecards: Scorecard[]
  pendingPayouts: Payout[]
  dashboardData: {
    kpis: Record<string, number | string>
    pipeline: Record<string, number>
    today_scorecard: Scorecard | null
    recent_activities: ProspectActivity[]
  } | null
}

export default function AdminGenxClient({ lgs: initialLGs, prospects: initialProspects, communities: initialCommunities, scorecards: initialScorecards, pendingPayouts, dashboardData }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
  const [lgs, setLGs] = useState(initialLGs)
  const [prospects, setProspects] = useState(initialProspects)
  const [communities, setCommunities] = useState(initialCommunities)
  const [scorecards, setScorecards] = useState(initialScorecards)

  return (
    <div style={{ minHeight: '100vh', background: S.bg, fontFamily: S.font }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${S.border}`, background: S.bg, padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: S.text, margin: 0 }}>GENX CRM</h1>
          <p style={{ fontSize: 13, color: S.textSecondary, margin: '4px 0 0' }}>Recruitment & Lead Generator Management</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '8px 18px',
                borderRadius: S.radius,
                border: activeTab === tab.key ? `1px solid ${S.accent}` : `1px solid ${S.border}`,
                background: activeTab === tab.key ? S.accentLight : S.bg,
                color: activeTab === tab.key ? S.accent : S.textSecondary,
                fontSize: 13,
                fontWeight: activeTab === tab.key ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ padding: '24px 32px', maxWidth: 1440, margin: '0 auto' }}>
        {activeTab === 'dashboard' && (
          <DashboardTab
            dashboardData={dashboardData}
            lgs={lgs}
            pendingPayouts={pendingPayouts}
            onRefresh={async () => {
              const res = await fetch('/api/admin/genx/dashboard')
              if (res.ok) {
                // Dashboard data will refresh on page reload
                window.location.reload()
              }
            }}
          />
        )}
        {activeTab === 'prospects' && (
          <ProspectsTab
            prospects={prospects}
            communities={communities}
            onUpdate={setProspects}
          />
        )}
        {activeTab === 'lgs' && (
          <LGsTab
            lgs={lgs}
            communities={communities}
            pendingPayouts={pendingPayouts}
            onUpdate={setLGs}
          />
        )}
        {activeTab === 'communities' && (
          <CommunitiesTab
            communities={communities}
            onUpdate={setCommunities}
          />
        )}
        {activeTab === 'scorecard' && (
          <ScorecardTab
            scorecards={scorecards}
            onUpdate={setScorecards}
          />
        )}
      </div>
    </div>
  )
}
