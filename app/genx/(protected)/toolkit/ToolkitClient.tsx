'use client'
import { useState } from 'react'
import ScriptsTab from './tabs/ScriptsTab'
import PipelineTab from './tabs/PipelineTab'
import LinksTab from './tabs/LinksTab'
import AssetsTab from './tabs/AssetsTab'
import PlannerTab from './tabs/PlannerTab'
import AnalyticsTab from './tabs/AnalyticsTab'

export type DefaultScript = {
  id: string; category: string; subcategory: string | null; channel: string | null
  title: string; content: string; description: string | null; situation: string | null
  difficulty: string | null; estimated_response_rate: string | null
  is_featured: boolean; usage_count: number
}
export type MyScript = {
  id: string; lg_id: string; category: string; channel: string
  title: string; content: string; notes: string | null
  is_modified_from: string | null; times_used: number
  times_replied: number; times_converted: number
  is_pinned: boolean; sort_order: number
  created_at: string; updated_at: string
}
export type Contact = {
  id: string; lg_id: string; name: string; channel: string; handle: string | null
  status: string; notes: string | null; source: string | null
  first_contacted_at: string | null; last_contacted_at: string | null
  next_followup_at: string | null; followup_count: number
  last_message_sent: string | null; last_objection: string | null
  is_starred: boolean; is_archived: boolean; created_at: string; updated_at: string
}
export type LinkRow = {
  id: string; lg_id: string; source: string; link_code: string; full_url: string
  click_count: number; signup_count: number; active_count: number
  created_at: string
}
export type Asset = {
  id: string; title: string; description: string | null; asset_type: string
  file_url: string | null; file_name: string | null; category: string
  earnings_amount: number | null; va_count: number | null; download_count: number
}
export type PlannerDay = {
  id: string; lg_id: string; week_start: string; day_of_week: number
  dms_sent: number; posts_made: number; followups_sent: number; calls_made: number
}

const TABS = ['Pipeline', 'Scripts', 'Links', 'Assets', 'Planner', 'Analytics'] as const
type Tab = typeof TABS[number]

const S = {
  label: { fontSize: 11, fontWeight: 500, color: '#555555', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8, display: 'block' },
  mono: { fontFamily: "'JetBrains Mono', monospace" as const },
  card: { background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 24 } as React.CSSProperties,
  input: { width: '100%', background: '#0A0A0A', border: '1px solid #1F1F1F', borderRadius: 6, padding: '10px 12px', color: '#FFFFFF', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const },
  btn: { background: '#FFFFFF', color: '#0A0A0A', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  btnGhost: { background: '#141414', border: '1px solid #1F1F1F', borderRadius: 6, padding: '8px 16px', fontSize: 12, color: '#888888', cursor: 'pointer' } as React.CSSProperties,
  btnSm: { background: '#1F1F1F', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 11, color: '#888888', cursor: 'pointer' } as React.CSSProperties,
}

export { S }

export default function ToolkitClient({
  lgId, referralCode, defaultLink,
  defaultScripts, myScripts: initMyScripts,
  contacts: initContacts,
  links: initLinks, totalClicks,
  assets, plannerData, weekStart,
}: {
  lgId: string
  referralCode: string
  defaultLink: string
  defaultScripts: DefaultScript[]
  myScripts: MyScript[]
  contacts: Contact[]
  links: LinkRow[]
  totalClicks: number
  assets: Asset[]
  plannerData: PlannerDay[]
  weekStart: string
}) {
  const [activeTab, setActiveTab] = useState<Tab>('Pipeline')
  const [myScripts, setMyScripts] = useState(initMyScripts)
  const [contacts, setContacts] = useState(initContacts)
  const [links, setLinks] = useState(initLinks)

  return (
    <div>
      {/* Sub-tab navigation */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid #1F1F1F',
        marginBottom: 32,
        overflowX: 'auto',
      }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #FFFFFF' : '2px solid transparent',
              padding: '10px 20px',
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.06em',
              color: activeTab === tab ? '#FFFFFF' : '#555555',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              marginBottom: -1,
              transition: 'color 0.15s',
            }}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      {activeTab === 'Pipeline' && (
        <PipelineTab
          contacts={contacts}
          setContacts={setContacts}
          S={S}
        />
      )}
      {activeTab === 'Scripts' && (
        <ScriptsTab
          defaultScripts={defaultScripts}
          myScripts={myScripts}
          setMyScripts={setMyScripts}
          S={S}
        />
      )}
      {activeTab === 'Links' && (
        <LinksTab
          referralCode={referralCode}
          defaultLink={defaultLink}
          links={links}
          setLinks={setLinks}
          totalClicks={totalClicks}
          S={S}
        />
      )}
      {activeTab === 'Assets' && (
        <AssetsTab assets={assets} S={S} />
      )}
      {activeTab === 'Planner' && (
        <PlannerTab
          plannerData={plannerData}
          weekStart={weekStart}
          lgId={lgId}
          S={S}
        />
      )}
      {activeTab === 'Analytics' && (
        <AnalyticsTab contacts={contacts} myScripts={myScripts} S={S} />
      )}
    </div>
  )
}
