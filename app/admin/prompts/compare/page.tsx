'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Prompt } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldKey = keyof Pick<
  Prompt,
  | 'system_prompt'
  | 'formatting_rules'
  | 'forbidden_words'
  | 'required_keywords'
  | 'max_title_length'
  | 'max_description_length'
  | 'allow_html'
  | 'allow_emoji'
>

const FIELDS: { key: FieldKey; label: string }[] = [
  { key: 'system_prompt',          label: 'System Prompt'         },
  { key: 'formatting_rules',       label: 'Formatting Rules'      },
  { key: 'forbidden_words',        label: 'Forbidden Words'       },
  { key: 'required_keywords',      label: 'Required Keywords'     },
  { key: 'max_title_length',       label: 'Max Title Length'      },
  { key: 'max_description_length', label: 'Max Description Length'},
  { key: 'allow_html',             label: 'HTML Allowed'          },
  { key: 'allow_emoji',            label: 'Emoji Allowed'         },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compareField(
  a: string | number | boolean | null,
  b: string | number | boolean | null,
): boolean {
  return String(a ?? '') === String(b ?? '')
}

function displayValue(val: string | number | boolean | null): string {
  if (val === null || val === undefined || val === '') return '—'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  return String(val)
}

// ─── Component ────────────────────────────────────────────────────────────────

function ComparePromptsContent() {
  const params = useSearchParams()
  const aId = params.get('a')
  const bId = params.get('b')

  const [promptA, setPromptA] = useState<Prompt | null>(null)
  const [promptB, setPromptB] = useState<Prompt | null>(null)
  const [clientsA, setClientsA] = useState(0)
  const [clientsB, setClientsB] = useState(0)
  const [loading, setLoading] = useState(true)
  const [transferring, setTransferring] = useState(false)

  useEffect(() => {
    if (!aId || !bId) {
      setLoading(false)
      return
    }

    async function load() {
      setLoading(true)
      const [resA, resB, resClientsA, resClientsB] = await Promise.all([
        supabase.from('prompts').select('*').eq('id', aId).single(),
        supabase.from('prompts').select('*').eq('id', bId).single(),
        supabase.from('client_profiles').select('id', { count: 'exact', head: true }).eq('prompt_id', aId),
        supabase.from('client_profiles').select('id', { count: 'exact', head: true }).eq('prompt_id', bId),
      ])

      if (resA.data) setPromptA(resA.data as Prompt)
      if (resB.data) setPromptB(resB.data as Prompt)
      setClientsA(resClientsA.count ?? 0)
      setClientsB(resClientsB.count ?? 0)
      setLoading(false)
    }

    load()
  }, [aId, bId])

  // Transfer all clients from B to A
  async function handleUseAForB() {
    if (!promptA || !promptB) return
    const confirmed = window.confirm(
      `Move all ${clientsB} client(s) from "${promptB.name}" to "${promptA.name}"?`
    )
    if (!confirmed) return
    setTransferring(true)
    await supabase
      .from('client_profiles')
      .update({ prompt_id: promptA.id })
      .eq('prompt_id', promptB.id)
    setClientsA(clientsA + clientsB)
    setClientsB(0)
    setTransferring(false)
  }

  // Transfer all clients from A to B
  async function handleUseBForA() {
    if (!promptA || !promptB) return
    const confirmed = window.confirm(
      `Move all ${clientsA} client(s) from "${promptA.name}" to "${promptB.name}"?`
    )
    if (!confirmed) return
    setTransferring(true)
    await supabase
      .from('client_profiles')
      .update({ prompt_id: promptB.id })
      .eq('prompt_id', promptA.id)
    setClientsB(clientsA + clientsB)
    setClientsA(0)
    setTransferring(false)
  }

  // ── Missing params ──────────────────────────────────────────────────────────
  if (!aId || !bId) {
    return (
      <div style={{ padding: '48px 32px', fontFamily: 'Inter, sans-serif' }}>
        <p style={{ fontSize: 14, color: '#666666' }}>
          Missing prompt IDs.{' '}
          <Link href="/admin/prompts" style={{ color: '#111111', textDecoration: 'underline' }}>
            Return to Prompt Library
          </Link>
        </p>
      </div>
    )
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '48px 32px', fontFamily: 'Inter, sans-serif' }}>
        <p style={{ fontSize: 14, color: '#999999' }}>Loading…</p>
      </div>
    )
  }

  // ── Main layout ─────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        fontFamily: 'Inter, sans-serif',
        minHeight: '100vh',
        backgroundColor: '#FFFFFF',
        color: '#111111',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ padding: '32px 32px 24px' }}>
        <Link
          href="/admin/prompts"
          style={{
            fontSize: 12,
            color: '#999999',
            textDecoration: 'none',
            display: 'inline-block',
            marginBottom: 16,
          }}
        >
          ← Back to Prompt Library
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 300, margin: 0, color: '#111111' }}>
          Compare Templates
        </h1>
      </div>

      {/* ── Two-column header ────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1px 1fr',
          borderTop: '1px solid #EEEEEE',
          borderBottom: '1px solid #EEEEEE',
        }}
      >
        {/* Column A header */}
        <ColumnHeader prompt={promptA} clientCount={clientsA} label="A" />

        {/* Divider */}
        <div style={{ backgroundColor: '#EEEEEE' }} />

        {/* Column B header */}
        <ColumnHeader prompt={promptB} clientCount={clientsB} label="B" />
      </div>

      {/* ── Field rows ──────────────────────────────────────────────────────── */}
      <div style={{ overflowY: 'auto' }}>
        {FIELDS.map(({ key, label }) => {
          const valA = promptA?.[key] ?? null
          const valB = promptB?.[key] ?? null
          const same = compareField(
            valA as string | number | boolean | null,
            valB as string | number | boolean | null,
          )

          return (
            <div
              key={key}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1px 1fr',
                borderBottom: '1px solid #F5F5F5',
              }}
            >
              {/* Left cell */}
              <FieldCell value={valA as string | number | boolean | null} isDiff={!same} />

              {/* Divider */}
              <div style={{ backgroundColor: '#EEEEEE' }} />

              {/* Right cell */}
              <FieldCell value={valB as string | number | boolean | null} isDiff={!same} />

              {/* Row label — positioned via a separate full-width row above the cells */}
              {/* We render it as an overlay label by wrapping in a relative container.
                  For simplicity we place the label row before each pair. */}
            </div>
          )
        }).map((row, i) => {
          const { key, label } = FIELDS[i]
          const valA = promptA?.[key] ?? null
          const valB = promptB?.[key] ?? null
          const same = compareField(
            valA as string | number | boolean | null,
            valB as string | number | boolean | null,
          )
          return (
            <div key={key + '_wrap'}>
              {/* Label row */}
              <div
                style={{
                  padding: '8px 16px 2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: same ? '#FFFFFF' : '#FAFAFA',
                }}
              >
                {!same && (
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      backgroundColor: '#111111',
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                )}
                <span
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: same ? '#EEEEEE' : '#CCCCCC',
                  }}
                >
                  {label}
                </span>
              </div>
              {row}
            </div>
          )
        })}
      </div>

      {/* ── Bottom actions ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          padding: '32px',
          borderTop: '1px solid #EEEEEE',
          flexWrap: 'wrap',
        }}
      >
        <ActionButton
          onClick={handleUseAForB}
          disabled={transferring || !promptA || !promptB || clientsB === 0}
          label={`Use A for all linked clients of B (${clientsB})`}
        />
        <ActionButton
          onClick={handleUseBForA}
          disabled={transferring || !promptA || !promptB || clientsA === 0}
          label={`Use B for all linked clients of A (${clientsA})`}
        />
      </div>
    </div>
  )
}

export default function ComparePromptsPage() {
  return (
    <Suspense>
      <ComparePromptsContent />
    </Suspense>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ColumnHeader({
  prompt,
  clientCount,
  label,
}: {
  prompt: Prompt | null
  clientCount: number
  label: string
}) {
  if (!prompt) {
    return (
      <div style={{ padding: '20px 16px' }}>
        <p style={{ fontSize: 12, color: '#CCCCCC', margin: 0 }}>Prompt {label} not found</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 16px' }}>
      <p style={{ fontSize: 16, fontWeight: 500, color: '#111111', margin: '0 0 8px' }}>
        {prompt.name}
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {prompt.niche && <Pill text={prompt.niche} />}
        {prompt.language && <Pill text={prompt.language} />}
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <span style={{ fontSize: 11, color: '#CCCCCC' }}>v{prompt.version}</span>
        <span style={{ fontSize: 11, color: '#CCCCCC' }}>{clientCount} clients</span>
      </div>
    </div>
  )
}

function Pill({ text }: { text: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        color: '#666666',
        backgroundColor: '#F5F5F7',
        borderRadius: 4,
        padding: '2px 8px',
      }}
    >
      {text}
    </span>
  )
}

function FieldCell({
  value,
  isDiff,
}: {
  value: string | number | boolean | null
  isDiff: boolean
}) {
  const display = displayValue(value)
  const isEmpty = display === '—'

  return (
    <div
      style={{
        padding: '8px 16px 12px',
        backgroundColor: isDiff ? '#FAFAFA' : 'transparent',
        minHeight: 40,
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontFamily: 'monospace',
          color: isEmpty ? '#CCCCCC' : '#666666',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {display}
      </span>
    </div>
  )
}

function ActionButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void
  disabled: boolean
  label: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 13,
        fontWeight: 500,
        color: disabled ? '#CCCCCC' : '#111111',
        backgroundColor: disabled ? '#F5F5F7' : '#F5F5F7',
        border: '1px solid #E0E0E0',
        borderRadius: 8,
        padding: '10px 16px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s',
      }}
    >
      {label}
    </button>
  )
}
