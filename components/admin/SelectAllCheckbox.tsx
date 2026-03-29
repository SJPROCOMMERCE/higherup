'use client'
import { useRef, useEffect } from 'react'

export function SelectAllCheckbox({
  allSelected,
  someSelected,
  onChange,
}: {
  allSelected: boolean
  someSelected: boolean
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someSelected && !allSelected
  }, [someSelected, allSelected])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allSelected}
      onChange={onChange}
      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#111111', flexShrink: 0 }}
    />
  )
}
