'use client'

import { useState, useEffect } from 'react'

interface RevealTextProps {
  children: React.ReactNode
  delay?: number
  className?: string
  style?: React.CSSProperties
  as?: 'div' | 'span' | 'p' | 'h1' | 'h2' | 'h3'
}

export function RevealText({
  children,
  delay = 0,
  className = '',
  style: extraStyle,
  as: Tag = 'div',
}: RevealTextProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  return (
    <Tag
      style={{
        opacity:    visible ? 1 : 0,
        transform:  visible ? 'translateY(0)' : 'translateY(14px)',
        transition: 'opacity 0.75s ease-out, transform 0.75s ease-out',
        ...extraStyle,
      }}
      className={className}
    >
      {children}
    </Tag>
  )
}
