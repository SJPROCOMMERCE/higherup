'use client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TemplateInfo = {
  id:         string
  name:       string
  niche:      string | null
  language:   string | null
  is_default?: boolean | null
}

export type TemplateSelectorData = {
  assignedTemplates:  TemplateInfo[]   // from client_prompts
  customTemplates:    TemplateInfo[]   // from applied prompt_requests
  generalTemplates:   TemplateInfo[]   // HigherUp defaults (not in above)
}

export type TemplateSelectorProps = {
  data:               TemplateSelectorData
  selectedTemplateId: string
  onChange:           (id: string) => void
}

// ─── Sub-component ────────────────────────────────────────────────────────────

function TemplateOption({
  name, subtitle, tag, selected, onClick,
}: {
  name:     string
  subtitle: string
  tag?:     string
  selected: boolean
  onClick:  () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left',
        padding: '10px 14px', borderRadius: 10,
        border: `1px solid ${selected ? '#111111' : '#EEEEEE'}`,
        background: selected ? '#FAFAFA' : '#FFFFFF',
        cursor: 'pointer', transition: 'border-color 0.15s',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = '#CCCCCC' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = '#EEEEEE' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 16, height: 16, borderRadius: '50%',
          border: `1.5px solid ${selected ? '#111111' : '#CCCCCC'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {selected && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#111111' }} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: selected ? 500 : 400, color: '#111111' }}>{name}</span>
            {tag && (
              <span style={{
                fontSize: 10, fontWeight: 500, color: '#3B82F6',
                background: '#DBEAFE', borderRadius: 100, padding: '2px 8px',
              }}>{tag}</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: '#CCCCCC', margin: '2px 0 0', lineHeight: 1.4 }}>{subtitle}</p>
        </div>
      </div>
    </button>
  )
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 500, textTransform: 'uppercase' as const,
      letterSpacing: '0.08em', color: '#DDDDDD', padding: '4px 0 2px',
    }}>
      {text}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TemplateSelector({ data, selectedTemplateId, onChange }: TemplateSelectorProps) {
  const { assignedTemplates, customTemplates, generalTemplates } = data
  const hasAny = assignedTemplates.length > 0 || customTemplates.length > 0 || generalTemplates.length > 0

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{
        fontSize: 10, fontWeight: 500, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: '#CCCCCC', marginBottom: 10,
      }}>
        Template
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

        {/* Client's assigned templates */}
        {assignedTemplates.length > 0 && (
          <>
            <SectionLabel text="Client's Templates" />
            {assignedTemplates.map(t => (
              <TemplateOption
                key={t.id}
                name={t.name}
                subtitle={[t.niche ?? 'General', t.language ?? 'English'].join(' · ')}
                selected={selectedTemplateId === t.id}
                onClick={() => onChange(t.id)}
              />
            ))}
          </>
        )}

        {/* Custom templates from applied requests */}
        {customTemplates.length > 0 && (
          <>
            <SectionLabel text="Your Requested" />
            {customTemplates.map(t => (
              <TemplateOption
                key={t.id}
                name={t.name}
                subtitle="Based on your optimization request"
                tag="Custom"
                selected={selectedTemplateId === t.id}
                onClick={() => onChange(t.id)}
              />
            ))}
          </>
        )}

        {/* General HigherUp templates */}
        {generalTemplates.length > 0 && (
          <>
            <SectionLabel text="General" />
            {generalTemplates.map(t => (
              <TemplateOption
                key={t.id}
                name={t.name}
                subtitle={[t.niche ?? 'General', t.language ?? 'English', t.is_default ? 'default' : ''].filter(Boolean).join(' · ')}
                selected={selectedTemplateId === t.id}
                onClick={() => onChange(t.id)}
              />
            ))}
          </>
        )}

        {!hasAny && (
          <p style={{ fontSize: 13, color: '#CCCCCC', margin: '8px 0' }}>
            No templates available. Contact admin.
          </p>
        )}
      </div>
    </div>
  )
}
