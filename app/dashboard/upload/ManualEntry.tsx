'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase, type Client, type Upload } from '@/lib/supabase'

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  black:  '#111111',
  sec:    '#999999',
  ter:    '#CCCCCC',
  ghost:  '#DDDDDD',
  div:    '#F0F0F0',
  red:    '#EF4444',
  bg:     '#FFFFFF',
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ManualColumn = {
  key:         string
  label:       string
  field:       string   // mapping field ('title', 'description', etc.) or ''
  required:    boolean
  placeholder: string
}

type Row = { id: string; cells: Record<string, string> }

// ─── Column definitions ───────────────────────────────────────────────────────

const COL_DEFS: Record<string, Omit<ManualColumn, 'key'>> = {
  title:       { label: 'Title',        field: 'title',       required: true,  placeholder: 'Product title' },
  description: { label: 'Description',  field: 'description', required: true,  placeholder: 'Product description...' },
  price:       { label: 'Price',        field: 'price',       required: false, placeholder: '0.00' },
  sku:         { label: 'SKU',          field: 'sku',         required: false, placeholder: 'SKU-001' },
  image:       { label: 'Image URL',    field: 'image',       required: false, placeholder: 'https://...' },
  vendor:      { label: 'Vendor',       field: 'vendor',      required: false, placeholder: 'Brand name' },
  tags:        { label: 'Tags',         field: 'tags',        required: false, placeholder: 'tag1, tag2' },
  type:        { label: 'Product Type', field: 'type',        required: false, placeholder: 'Electronics' },
  weight:      { label: 'Weight',       field: '',            required: false, placeholder: '0.5 kg' },
  variant:     { label: 'Product',      field: '',            required: false, placeholder: 'XL / Red' },
}

const def = (key: string): ManualColumn => ({ key, ...COL_DEFS[key] })

const DEFAULT_COLUMNS: ManualColumn[] = ['title', 'description', 'price', 'sku', 'image', 'vendor'].map(def)
const EXTRA_KEYS = ['tags', 'type', 'weight', 'variant']

type TemplateId = 'simple' | 'shopify' | 'full'
const TEMPLATES: Record<TemplateId, { label: string; keys: string[] }> = {
  simple:  { label: 'Simple (title + description)', keys: ['title', 'description'] },
  shopify: { label: 'Shopify Standard', keys: ['title', 'description', 'vendor', 'type', 'tags', 'image', 'price', 'sku'] },
  full:    { label: 'Full', keys: ['title', 'description', 'price', 'sku', 'image', 'vendor', 'tags', 'type', 'weight', 'variant'] },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string { return Math.random().toString(36).slice(2, 9) }
function emptyRow(): Row { return { id: uid(), cells: {} } }

function generateCSV(columns: ManualColumn[], rows: Row[]): string {
  const esc = (v: string) =>
    (v.includes(',') || v.includes('\n') || v.includes('"'))
      ? `"${v.replace(/"/g, '""')}"`
      : v
  const header   = columns.map(c => esc(c.label)).join(',')
  const dataRows = rows
    .filter(r => r.cells.title?.trim())
    .map(r => columns.map(c => esc(r.cells[c.key] ?? '')).join(','))
  return [header, ...dataRows].join('\n')
}

function buildColumnMapping(columns: ManualColumn[]): Record<string, string | null> {
  const result: Record<string, string | null> = {
    title: null, description: null, price: null, sku: null,
    vendor: null, tags: null, type: null, image: null,
  }
  for (const col of columns) {
    if (col.field && col.field in result) result[col.field] = col.label
  }
  return result
}

function draftKey(vaId: string, clientId: string): string {
  return `hu_manual_${vaId}_${clientId}`
}

// ─── Cell components ──────────────────────────────────────────────────────────

const baseCellStyle = {
  width: '100%', background: 'none', border: 'none', outline: 'none',
  fontSize: 14, color: T.black, fontFamily: 'inherit',
  padding: '14px 0', lineHeight: '1.5',
  borderBottom: '1px solid transparent',
  transition: 'border-color 0.15s',
} as const

function TextCell({ rowId, colKey, value, placeholder, onChange, onKeyDown, onPaste }: {
  rowId: string; colKey: string; value: string; placeholder: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void
}) {
  return (
    <input
      type="text"
      className="manual-cell"
      data-row-id={rowId}
      data-col-key={colKey}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      style={{ ...baseCellStyle }}
      onFocus={e => (e.currentTarget.style.borderBottomColor = '#EEEEEE')}
      onBlur={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
    />
  )
}

function DescriptionCell({ rowId, colKey, value, onChange, onKeyDown, onPaste }: {
  rowId: string; colKey: string; value: string
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function resize() {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(47, el.scrollHeight) + 'px'
  }

  useEffect(() => { resize() }, [value])

  return (
    <textarea
      ref={ref}
      className="manual-cell"
      data-row-id={rowId}
      data-col-key={colKey}
      value={value}
      placeholder="Product description..."
      onChange={e => { onChange(e.target.value); resize() }}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      style={{ ...baseCellStyle, resize: 'none', overflow: 'hidden', minHeight: 47, display: 'block' }}
      onFocus={e => { e.currentTarget.style.borderBottomColor = '#EEEEEE'; resize() }}
      onBlur={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
    />
  )
}

// ─── ManualEntry ──────────────────────────────────────────────────────────────

type ManualEntryProps = {
  va:          { id: string } | null
  client:      Client | null
  onBack:      () => void
  onProcessed: (newUpload: Upload, meta: { rows: number; productCount: number; storeName: string; fileName: string }) => void
}

export function ManualEntry({ va, client, onBack, onProcessed }: ManualEntryProps) {
  const [columns,      setColumns]      = useState<ManualColumn[]>(DEFAULT_COLUMNS)
  const [rows,         setRows]         = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()])
  const [hovRow,       setHovRow]       = useState<string | null>(null)
  const [hovCol,       setHovCol]       = useState<string | null>(null)
  const [showColMenu,  setShowColMenu]  = useState(false)
  const [showTmplMenu, setShowTmplMenu] = useState(false)
  const [customInput,  setCustomInput]  = useState(false)
  const [customName,   setCustomName]   = useState('')
  const [draftAvail,   setDraftAvail]   = useState<{ columns: ManualColumn[]; rows: Row[] } | null>(null)
  const [uploading,    setUploading]    = useState(false)
  const [uploadErr,    setUploadErr]    = useState<string | null>(null)

  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const colMenuRef = useRef<HTMLDivElement>(null)
  const tmplRef    = useRef<HTMLDivElement>(null)

  // ─── Draft: load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!va?.id || !client?.id) return
    try {
      const raw = localStorage.getItem(draftKey(va.id, client.id))
      if (!raw) return
      const d = JSON.parse(raw) as { columns: ManualColumn[]; rows: Row[] }
      if (d.rows?.some((r: Row) => r.cells.title?.trim())) {
        setDraftAvail(d)
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [va?.id, client?.id])

  // ─── Draft: auto-save every 10s ─────────────────────────────────────────────
  useEffect(() => {
    if (!va?.id || !client?.id) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (rows.some(r => r.cells.title?.trim())) {
        localStorage.setItem(draftKey(va.id, client.id), JSON.stringify({ columns, rows }))
      }
    }, 10_000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [columns, rows, va?.id, client?.id])

  // ─── Close menus on outside click ───────────────────────────────────────────
  useEffect(() => {
    function outside(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setShowColMenu(false); setCustomInput(false); setCustomName('')
      }
      if (tmplRef.current && !tmplRef.current.contains(e.target as Node)) {
        setShowTmplMenu(false)
      }
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  // ─── Row ops ─────────────────────────────────────────────────────────────────
  function addRow() {
    const nr = emptyRow()
    setRows(prev => [...prev, nr])
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-row-id="${nr.id}"][data-col-key="title"]`)
      el?.focus()
    }, 30)
  }

  function removeRow(id: string) {
    setRows(prev => prev.length <= 1 ? prev : prev.filter(r => r.id !== id))
  }

  function updateCell(rowId: string, colKey: string, value: string) {
    setRows(prev => prev.map(r => r.id !== rowId ? r : { ...r, cells: { ...r.cells, [colKey]: value } }))
  }

  // ─── Column ops ──────────────────────────────────────────────────────────────
  function addPredefinedCol(key: string) {
    if (columns.some(c => c.key === key)) return
    setColumns(prev => [...prev, def(key)])
    setShowColMenu(false)
  }

  function addCustomCol() {
    const label = customName.trim()
    if (!label) return
    const key = `custom_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${uid()}`
    setColumns(prev => [...prev, { key, label, field: '', required: false, placeholder: label }])
    setCustomName(''); setCustomInput(false); setShowColMenu(false)
  }

  function removeCol(key: string) {
    if (key === 'title' || key === 'description') return
    setColumns(prev => prev.filter(c => c.key !== key))
    setRows(prev => prev.map(r => {
      const cells = { ...r.cells }; delete cells[key]; return { ...r, cells }
    }))
  }

  // ─── Template ────────────────────────────────────────────────────────────────
  function applyTemplate(id: TemplateId) {
    const hasData = rows.some(r => Object.values(r.cells).some(v => v.trim()))
    if (hasData && !confirm('This will clear your current data. Continue?')) return
    const tmpl = TEMPLATES[id]
    const newCols: ManualColumn[] = tmpl.keys.map(k =>
      COL_DEFS[k] ? def(k) : { key: k, label: k, field: '', required: false, placeholder: k }
    )
    setColumns(newCols)
    setRows([emptyRow(), emptyRow(), emptyRow()])
    setShowTmplMenu(false)
  }

  // ─── Paste: TSV detection ────────────────────────────────────────────────────
  function handlePaste(
    e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    rowId: string, colKey: string,
  ) {
    const text = e.clipboardData.getData('text/plain')
    if (!text.includes('\t') && !(text.includes('\n') && text.trim().split('\n').length > 1)) return
    e.preventDefault()

    const lines  = text.trim().split(/\r?\n/)
    const parsed = lines.map(l => l.split('\t'))
    const startColIdx = columns.findIndex(c => c.key === colKey)
    const startRowIdx = rows.findIndex(r => r.id === rowId)

    setRows(prev => {
      const updated = [...prev]
      for (let li = 0; li < parsed.length; li++) {
        const rIdx = startRowIdx + li
        while (updated.length <= rIdx) updated.push(emptyRow())
        const cells: Record<string, string> = { ...updated[rIdx].cells }
        for (let ci = 0; ci < parsed[li].length; ci++) {
          const cIdx = startColIdx + ci
          if (cIdx < columns.length) cells[columns[cIdx].key] = parsed[li][ci]
        }
        updated[rIdx] = { ...updated[rIdx], cells }
      }
      return updated
    })
  }

  // ─── Keyboard navigation ─────────────────────────────────────────────────────
  function focusCell(rowId: string, colKey: string) {
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-row-id="${rowId}"][data-col-key="${colKey}"]`)
      el?.focus()
    }, 16)
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    rowId: string, colKey: string,
  ) {
    const colIdx = columns.findIndex(c => c.key === colKey)
    const rowIdx = rows.findIndex(r => r.id === rowId)

    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      if (colIdx < columns.length - 1) {
        focusCell(rowId, columns[colIdx + 1].key)
      } else if (rowIdx < rows.length - 1) {
        focusCell(rows[rowIdx + 1].id, columns[0].key)
      } else {
        const nr = emptyRow()
        setRows(prev => [...prev, nr])
        setTimeout(() => focusCell(nr.id, columns[0].key), 30)
      }
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      if (colIdx > 0) {
        focusCell(rowId, columns[colIdx - 1].key)
      } else if (rowIdx > 0) {
        focusCell(rows[rowIdx - 1].id, columns[columns.length - 1].key)
      }
    } else if (e.key === 'Enter' && colKey !== 'description') {
      e.preventDefault()
      if (rowIdx < rows.length - 1) {
        focusCell(rows[rowIdx + 1].id, colKey)
      } else {
        const nr = emptyRow()
        setRows(prev => [...prev, nr])
        setTimeout(() => focusCell(nr.id, colKey), 30)
      }
    } else if (e.key === 'Escape') {
      (e.target as HTMLElement).blur()
    }
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────
  async function handleProcess() {
    if (!va || !client || uploading) return
    setUploading(true); setUploadErr(null)
    try {
      const validRows = rows.filter(r => r.cells.title?.trim() && r.cells.description?.trim())
      if (validRows.length === 0) { setUploadErr('Add at least one product with title and description.'); setUploading(false); return }

      const csvText = generateCSV(columns, validRows)
      const ts      = Date.now()
      const path    = `${va.id}/${client.id}/${ts}_manual-entry.csv`
      const blob    = new Blob([csvText], { type: 'text/csv' })

      const { error: storErr } = await supabase.storage.from('uploads')
        .upload(path, blob, { contentType: 'text/csv', upsert: false })
      if (storErr) throw new Error(storErr.message)

      const { data: newUpload, error: dbErr } = await supabase.from('uploads').insert({
        va_id:                va.id,
        client_id:            client.id,
        store_name:           client.store_name,
        file_type:            'manual',
        product_row_count:    validRows.length,
        unique_product_count: validRows.length, // manual entry: every row is a product
        status:               'queued',
        input_file_path:      path,
        column_mapping:       buildColumnMapping(columns),
        sheet_name:           null,
      }).select().single()

      if (dbErr || !newUpload) throw new Error(dbErr?.message ?? 'Insert failed')

      // Clear draft
      localStorage.removeItem(draftKey(va.id, client.id))

      onProcessed(newUpload as Upload, {
        rows:         validRows.length,
        productCount: validRows.length,
        storeName:    client.store_name,
        fileName:     'Manual entry',
      })
    } catch (err: unknown) {
      setUploadErr(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    }
    setUploading(false)
  }

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const existingKeys   = new Set(columns.map(c => c.key))
  const availableExtra = EXTRA_KEYS.filter(k => !existingKeys.has(k))
  const productCount   = rows.filter(r => r.cells.title?.trim()).length
  const canSubmit      = rows.some(r => r.cells.title?.trim() && r.cells.description?.trim())

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Placeholder styles */}
      <style>{`.manual-cell::placeholder { color: #DDDDDD; }`}</style>

      {/* Back */}
      <button
        onClick={onBack}
        style={{ fontSize: 11, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 16px', transition: 'color 0.15s', fontFamily: 'inherit' }}
        onMouseEnter={e => (e.currentTarget.style.color = T.black)}
        onMouseLeave={e => (e.currentTarget.style.color = T.ter)}
      >
        ← Back to file upload
      </button>

      {/* Draft banner */}
      {draftAvail && (
        <div style={{ marginBottom: 16, fontSize: 13, color: T.sec }}>
          You have unsaved products for {client?.store_name ?? 'this store'}.{' '}
          <button
            onClick={() => { setColumns(draftAvail.columns); setRows(draftAvail.rows); setDraftAvail(null) }}
            style={{ fontSize: 13, color: T.black, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', textDecoration: 'underline' }}
          >Continue</button>
          {'  '}
          <button
            onClick={() => { setDraftAvail(null); if (va && client) localStorage.removeItem(draftKey(va.id, client.id)) }}
            style={{ fontSize: 13, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
          >Start fresh</button>
        </div>
      )}

      {/* Header: title + template picker */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: T.black }}>Add products</div>
        <div ref={tmplRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowTmplMenu(v => !v)}
            style={{ fontSize: 12, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s', fontFamily: 'inherit' }}
            onMouseEnter={e => (e.currentTarget.style.color = T.black)}
            onMouseLeave={e => (e.currentTarget.style.color = T.ter)}
          >
            Start from template
          </button>
          {showTmplMenu && (
            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: T.bg, border: '1px solid #EEEEEE', minWidth: 210, zIndex: 50, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
              {(Object.entries(TEMPLATES) as [TemplateId, typeof TEMPLATES[TemplateId]][]).map(([id, tmpl]) => (
                <button key={id} onClick={() => applyTemplate(id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13, color: T.black, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#FAFAFA')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >{tmpl.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Editable table ──────────────────────────────────────────────────── */}
      <div style={{ overflowX: 'auto', marginBottom: 8 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 480, width: '100%' }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key}
                  onMouseEnter={() => setHovCol(col.key)}
                  onMouseLeave={() => setHovCol(null)}
                  style={{ padding: '0 16px 8px 0', textAlign: 'left', borderBottom: `1px solid ${T.div}`, position: 'relative', whiteSpace: 'nowrap', minWidth: col.key === 'description' ? 200 : 80 }}
                >
                  <span style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.ter }}>
                    {col.label}
                  </span>
                  {hovCol === col.key && !col.required && (
                    <button
                      onClick={() => removeCol(col.key)}
                      style={{ position: 'absolute', top: 0, right: 2, fontSize: 10, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1.4, transition: 'color 0.12s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = T.black)}
                      onMouseLeave={e => (e.currentTarget.style.color = T.ghost)}
                    >×</button>
                  )}
                </th>
              ))}

              {/* + Column */}
              <th style={{ padding: '0 0 8px 0', borderBottom: `1px solid ${T.div}`, verticalAlign: 'bottom', whiteSpace: 'nowrap' }}>
                <div ref={colMenuRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => { setShowColMenu(v => !v); setCustomInput(false); setCustomName('') }}
                    style={{ fontSize: 11, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s', fontFamily: 'inherit' }}
                    onMouseEnter={e => (e.currentTarget.style.color = T.black)}
                    onMouseLeave={e => (e.currentTarget.style.color = T.ter)}
                  >
                    + Column
                  </button>
                  {showColMenu && (
                    <div style={{ position: 'absolute', left: 0, top: '100%', marginTop: 4, background: T.bg, border: '1px solid #EEEEEE', minWidth: 160, zIndex: 50, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
                      {availableExtra.length === 0 && !customInput && (
                        <div style={{ padding: '10px 14px', fontSize: 12, color: T.ter }}>All columns added</div>
                      )}
                      {availableExtra.map(k => (
                        <button key={k} onClick={() => addPredefinedCol(k)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13, color: T.black, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#FAFAFA')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >{COL_DEFS[k].label}</button>
                      ))}
                      {!customInput ? (
                        <button onClick={() => setCustomInput(true)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13, color: T.sec, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderTop: availableExtra.length > 0 ? `1px solid #F5F5F5` : 'none' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#FAFAFA')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >Custom…</button>
                      ) : (
                        <div style={{ padding: '8px 14px', display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            autoFocus
                            value={customName}
                            onChange={e => setCustomName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') addCustomCol()
                              if (e.key === 'Escape') { setCustomInput(false); setCustomName('') }
                            }}
                            placeholder="Column name"
                            style={{ flex: 1, fontSize: 12, border: 'none', outline: 'none', borderBottom: '1px solid #EEEEEE', background: 'none', padding: '2px 0', fontFamily: 'inherit' }}
                          />
                          <button onClick={addCustomCol} style={{ fontSize: 12, color: T.black, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Add</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </th>

              {/* delete col spacer */}
              <th style={{ width: 24, borderBottom: `1px solid ${T.div}` }} />
            </tr>
          </thead>

          <tbody>
            {rows.map(row => (
              <tr key={row.id}
                onMouseEnter={() => setHovRow(row.id)}
                onMouseLeave={() => setHovRow(null)}
              >
                {columns.map(col => (
                  <td key={col.key} style={{ padding: '0 16px 0 0', borderBottom: `1px solid #FAFAFA`, verticalAlign: 'top' }}>
                    {col.key === 'description' ? (
                      <DescriptionCell
                        rowId={row.id} colKey={col.key}
                        value={row.cells[col.key] ?? ''}
                        onChange={v => updateCell(row.id, col.key, v)}
                        onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => handleKeyDown(e, row.id, col.key)}
                        onPaste={(e: React.ClipboardEvent<HTMLTextAreaElement>) => handlePaste(e, row.id, col.key)}
                      />
                    ) : (
                      <TextCell
                        rowId={row.id} colKey={col.key}
                        value={row.cells[col.key] ?? ''}
                        placeholder={col.placeholder}
                        onChange={v => updateCell(row.id, col.key, v)}
                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => handleKeyDown(e, row.id, col.key)}
                        onPaste={(e: React.ClipboardEvent<HTMLInputElement>) => handlePaste(e, row.id, col.key)}
                      />
                    )}
                  </td>
                ))}

                {/* + column spacer */}
                <td style={{ borderBottom: `1px solid #FAFAFA` }} />

                {/* Row delete */}
                <td style={{ borderBottom: `1px solid #FAFAFA`, verticalAlign: 'middle', width: 24 }}>
                  {hovRow === row.id && rows.length > 1 && (
                    <button
                      onClick={() => removeRow(row.id)}
                      style={{ fontSize: 14, color: T.ghost, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, transition: 'color 0.12s', display: 'block' }}
                      onMouseEnter={e => (e.currentTarget.style.color = T.black)}
                      onMouseLeave={e => (e.currentTarget.style.color = T.ghost)}
                    >×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* + Add product */}
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={addRow}
          style={{ fontSize: 13, color: T.ter, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', transition: 'color 0.15s', fontFamily: 'inherit' }}
          onMouseEnter={e => (e.currentTarget.style.color = T.black)}
          onMouseLeave={e => (e.currentTarget.style.color = T.ter)}
        >
          + Add product
        </button>
      </div>

      {/* Product count */}
      <div style={{ fontSize: 12, color: T.ter, marginBottom: 28 }}>
        {productCount} {productCount === 1 ? 'product' : 'products'}
      </div>

      {/* Submit */}
      {uploadErr && <div style={{ fontSize: 12, color: T.red, marginBottom: 10 }}>{uploadErr}</div>}
      <button
        onClick={handleProcess}
        disabled={!canSubmit || uploading || !client}
        style={{
          fontSize: 13, fontWeight: 500, color: T.bg,
          background: T.black, border: 'none', borderRadius: 100,
          padding: '12px 28px', cursor: (canSubmit && !uploading && client) ? 'pointer' : 'default',
          fontFamily: 'inherit', transition: 'opacity 0.15s',
          opacity: (canSubmit && !uploading && client) ? 1 : 0.35,
        }}
        onMouseEnter={e => { if (canSubmit && !uploading && client) e.currentTarget.style.opacity = '0.75' }}
        onMouseLeave={e => { if (canSubmit && !uploading && client) e.currentTarget.style.opacity = '1' }}
      >
        {uploading ? 'Processing…' : 'Process listings'}
      </button>
    </div>
  )
}
