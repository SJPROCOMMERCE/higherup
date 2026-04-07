'use client'
import { useState, useCallback, useEffect } from 'react'
import DashboardTab from './tabs/DashboardTab'
import ProspectsTab from './tabs/ProspectsTab'
import LGsTab from './tabs/LGsTab'
import CommunitiesTab from './tabs/CommunitiesTab'
import ScorecardTab from './tabs/ScorecardTab'
import ScriptsTab from './tabs/ScriptsTab'
import { S } from './shared'
import type { LG, Prospect, Community, Scorecard, Payout, ProspectActivity } from './shared'

// Re-export for any code that imports from AdminGenxClient
export { S }
export type { LG, Prospect, Community, Scorecard, Payout, ProspectActivity }

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'prospects', label: 'Prospects' },
  { key: 'lgs', label: 'Lead Generators' },
  { key: 'communities', label: 'Communities' },
  { key: 'scripts', label: 'Scripts' },
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
  const [unrepliedCount, setUnrepliedCount] = useState(0)

  // Tab title badge for unreplied count
  useEffect(() => {
    if (unrepliedCount > 0) {
      document.title = `(${unrepliedCount}) GENX Admin`
    } else {
      document.title = 'GENX Admin'
    }
  }, [unrepliedCount])

  const handleUnrepliedCount = useCallback((count: number) => {
    setUnrepliedCount(count)
  }, [])

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
            onRefresh={() => window.location.reload()}
            onUnrepliedCount={handleUnrepliedCount}
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
        {activeTab === 'scripts' && (
          <ScriptsTab />
        )}
      </div>
    </div>
  )
}
