'use client'

interface ProgressLineProps {
  step:  number
  total: number
}

export function ProgressLine({ step, total }: ProgressLineProps) {
  const pct = Math.round((step / total) * 100)

  return (
    <div
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 2, background: '#F0F0F0', zIndex: 100,
      }}
    >
      <div
        style={{
          height: '100%',
          width:  `${pct}%`,
          background: '#111111',
          transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </div>
  )
}
