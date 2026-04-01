'use client'

import { createContext, useContext, useEffect, useState } from 'react'

interface DarkModeCtx {
  dark:   boolean
  toggle: () => void
}

const Ctx = createContext<DarkModeCtx>({ dark: false, toggle: () => {} })

export function DarkModeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('higherup_dark_mode')
    if (stored === 'true') {
      setDark(true)
      document.documentElement.classList.add('dark')
    }
  }, [])

  function toggle() {
    setDark(prev => {
      const next = !prev
      localStorage.setItem('higherup_dark_mode', String(next))
      if (next) document.documentElement.classList.add('dark')
      else       document.documentElement.classList.remove('dark')
      return next
    })
  }

  return <Ctx.Provider value={{ dark, toggle }}>{children}</Ctx.Provider>
}

export const useDarkMode = () => useContext(Ctx)
