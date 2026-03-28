'use client'

interface NumberInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  prefix?: string
  min?: number
  step?: string
  style?: React.CSSProperties
  inputMode?: 'numeric' | 'decimal'
}

export function NumberInput({ value, onChange, placeholder, prefix, min: _min, step: _step, style, inputMode = 'decimal' }: NumberInputProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {prefix && <span style={{ color: '#CCCCCC', marginRight: 2 }}>{prefix}</span>}
      <input
        type="text"
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={e => {
          const v = e.target.value
          if (v === '' || /^\d*\.?\d*$/.test(v)) onChange(v)
        }}
        style={style}
      />
    </span>
  )
}

export function toNum(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === '') return 0
  const n = parseFloat(String(value))
  return isNaN(n) ? 0 : n
}
