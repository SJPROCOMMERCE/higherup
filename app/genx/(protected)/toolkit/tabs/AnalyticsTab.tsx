'use client'
import type { Contact, MyScript } from '../ToolkitClient'

const STATUS_COLORS: Record<string, string> = {
  prospect: '#555555', contacted: '#888888', interested: '#FFFFFF',
  signed_up: '#22C55E', active: '#22C55E', lost: '#EF4444',
}
const STATUSES = ['prospect', 'contacted', 'interested', 'signed_up', 'active', 'lost']

export default function AnalyticsTab({
  contacts, myScripts, S,
}: {
  contacts: Contact[]
  myScripts: MyScript[]
  S: Record<string, React.CSSProperties | Record<string, unknown>>
}) {
  void S
  const mono = { fontFamily: "'JetBrains Mono', monospace" }

  // Funnel
  const funnel = STATUSES.map(s => ({
    status: s,
    count: contacts.filter(c => c.status === s).length,
  }))
  const maxFunnel = Math.max(...funnel.map(f => f.count), 1)
  const converted = contacts.filter(c => c.status === 'signed_up' || c.status === 'active').length
  const convRate = contacts.length > 0 ? Math.round(converted / contacts.length * 100) : 0

  // Channel performance
  const channelMap: Record<string, { total: number; converted: number }> = {}
  for (const c of contacts) {
    const ch = c.channel || 'other'
    if (!channelMap[ch]) channelMap[ch] = { total: 0, converted: 0 }
    channelMap[ch].total++
    if (c.status === 'signed_up' || c.status === 'active') channelMap[ch].converted++
  }
  const channels = Object.entries(channelMap)
    .map(([ch, d]) => ({
      channel: ch,
      total: d.total,
      converted: d.converted,
      rate: d.total > 0 ? Math.round(d.converted / d.total * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // Script performance
  const topScripts = myScripts
    .filter(s => s.times_used > 0)
    .sort((a, b) => b.times_used - a.times_used)
    .slice(0, 5)

  // Follow-up stats
  const overdue = contacts.filter(c => c.next_followup_at && new Date(c.next_followup_at) < new Date() && c.status !== 'lost').length
  const dueToday = contacts.filter(c => {
    if (!c.next_followup_at) return false
    const d = new Date(c.next_followup_at)
    const now = new Date()
    return d.toDateString() === now.toDateString()
  }).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Total Contacts', value: contacts.length },
          { label: 'Converted', value: converted },
          { label: 'Conv Rate', value: `${convRate}%` },
          { label: 'Follow-ups Due', value: overdue + dueToday, alert: overdue > 0 },
        ].map(stat => (
          <div key={stat.label} style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{stat.label}</div>
            <div style={{ ...mono, fontSize: 24, fontWeight: 700, color: (stat as { alert?: boolean }).alert ? '#EF4444' : '#FFFFFF' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Conversion funnel */}
      <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 20 }}>
        <div style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Conversion Funnel</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {funnel.map(f => (
            <div key={f.status} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 80, fontSize: 11, color: STATUS_COLORS[f.status] || '#555555', textTransform: 'capitalize', textAlign: 'right', flexShrink: 0 }}>{f.status}</div>
              <div style={{ flex: 1, height: 20, background: '#0A0A0A', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  background: STATUS_COLORS[f.status] || '#333',
                  opacity: 0.7,
                  width: f.count > 0 ? `${(f.count / maxFunnel) * 100}%` : '0%',
                  borderRadius: 3,
                  transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ ...mono, fontSize: 12, color: '#888888', width: 28, textAlign: 'right', flexShrink: 0 }}>{f.count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Channel performance */}
      {channels.length > 0 && (
        <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Channel Performance</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Channel', 'Contacts', 'Converted', 'Rate'].map(h => (
                  <th key={h} style={{ fontSize: 10, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 8px', textAlign: h === 'Channel' ? 'left' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {channels.map(ch => (
                <tr key={ch.channel} style={{ borderTop: '1px solid #1F1F1F' }}>
                  <td style={{ padding: '8px 8px', fontSize: 12, color: '#FFFFFF', textTransform: 'capitalize' }}>{ch.channel}</td>
                  <td style={{ ...mono, padding: '8px 8px', fontSize: 12, color: '#888888', textAlign: 'right' }}>{ch.total}</td>
                  <td style={{ ...mono, padding: '8px 8px', fontSize: 12, color: '#22C55E', textAlign: 'right' }}>{ch.converted}</td>
                  <td style={{ ...mono, padding: '8px 8px', fontSize: 12, color: ch.rate > 20 ? '#22C55E' : '#888888', textAlign: 'right' }}>{ch.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Script performance */}
      {topScripts.length > 0 && (
        <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Top Scripts (by usage)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topScripts.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #1F1F1F' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                </div>
                <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ ...mono, fontSize: 12, color: '#FFFFFF' }}>{s.times_used}</div>
                    <div style={{ fontSize: 10, color: '#555555' }}>used</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ ...mono, fontSize: 12, color: '#22C55E' }}>{s.times_converted}</div>
                    <div style={{ fontSize: 10, color: '#555555' }}>converted</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ ...mono, fontSize: 12, color: '#888888' }}>
                      {s.times_used > 0 ? Math.round(s.times_converted / s.times_used * 100) : 0}%
                    </div>
                    <div style={{ fontSize: 10, color: '#555555' }}>rate</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Follow-up urgency */}
      {(overdue > 0 || dueToday > 0) && (
        <div style={{ background: '#1A0A0A', border: '1px solid #3A1F1F', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#EF4444', fontWeight: 600, marginBottom: 8 }}>
            ⚠ Follow-up required
          </div>
          {overdue > 0 && <div style={{ fontSize: 12, color: '#888888' }}>{overdue} contact{overdue > 1 ? 's' : ''} overdue</div>}
          {dueToday > 0 && <div style={{ fontSize: 12, color: '#888888' }}>{dueToday} contact{dueToday > 1 ? 's' : ''} due today</div>}
          <div style={{ fontSize: 11, color: '#555555', marginTop: 6 }}>Go to Pipeline → filter by follow-up date to see who to contact.</div>
        </div>
      )}

      {contacts.length === 0 && (
        <div style={{ background: '#141414', border: '1px solid #1F1F1F', borderRadius: 8, padding: 32, textAlign: 'center', color: '#555555', fontSize: 13 }}>
          Add contacts in the Pipeline tab to see analytics here.
        </div>
      )}
    </div>
  )
}
