'use client'

import { useState, useEffect } from 'react'

interface RevealTextProps {
  children: React.ReactNode
  delay?: number
  style?: React.CSSProperties
  inline?: boolean // renders as span instead of div
}

export function RevealText({ children, delay = 0, style, inline = false }: RevealTextProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  const baseStyle: React.CSSProperties = {
    transition: 'opacity 0.7s ease-out, transform 0.7s ease-out',
    opacity:   visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(12px)',
    ...style,
  }

  return inline
    ? <span style={baseStyle}>{children}</span>
    : <div style={baseStyle}>{children}</div>
}
