'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { VA } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'

type VAContextType = {
  currentVA: VA | null
  setCurrentVA: (va: VA | null) => void
  refreshVA: () => Promise<void>
  logout: () => void
}

const VAContext = createContext<VAContextType | undefined>(undefined)

const STORAGE_KEY = 'higherup_va'

export function VAProvider({ children }: { children: ReactNode }) {
  const [currentVA, setCurrentVAState] = useState<VA | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        setCurrentVAState(JSON.parse(stored))
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  const setCurrentVA = (va: VA | null) => {
    setCurrentVAState(va)
    if (va) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(va))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  const refreshVA = async () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return
    try {
      const { id } = JSON.parse(stored) as { id: string }
      const { data } = await supabase.from('vas').select('*').eq('id', id).single()
      if (data) setCurrentVA(data as VA)
    } catch { /* silent */ }
  }

  const logout = () => setCurrentVA(null)

  return (
    <VAContext.Provider value={{ currentVA, setCurrentVA, refreshVA, logout }}>
      {children}
    </VAContext.Provider>
  )
}

export function useVA() {
  const context = useContext(VAContext)
  if (!context) throw new Error('useVA must be used within VAProvider')
  return context
}
