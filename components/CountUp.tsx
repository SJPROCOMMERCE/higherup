'use client'

import { useState, useEffect } from 'react'

interface CountUpProps {
  end: number
  prefix?: string
  suffix?: string
  duration?: number
  delay?: number
  decimals?: number
  style?: React.CSSProperties
}

export function CountUp({
  end, prefix = '', suffix = '',
  duration = 1500, delay = 0, decimals = 0, style,
}: CountUpProps) {
  const [value,   setValue]   = useState(0)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  useEffect(() => {
    if (!started) return
    const startTime = Date.now()
    function tick() {
      const elapsed  = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased    = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setValue(eased * end)
      if (progress < 1) requestAnimationFrame(tick)
      else setValue(end)
    }
    requestAnimationFrame(tick)
  }, [started, end, duration])

  const display = decimals > 0
    ? value.toFixed(decimals)
    : Math.round(value).toLocaleString()

  return (
    <span style={{
      opacity:    started ? 1 : 0,
      transition: 'opacity 0.3s',
      ...style,
    }}>
      {prefix}{display}{suffix}
    </span>
  )
}
