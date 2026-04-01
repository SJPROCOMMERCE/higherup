'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import t, { type Locale, type Translations } from '@/lib/translations'
import { supabase } from '@/lib/supabase'

interface LanguageCtx {
  locale:    Locale
  setLocale: (l: Locale) => void
  tr:        Translations
}

const Ctx = createContext<LanguageCtx>({
  locale:    'en',
  setLocale: () => {},
  tr:        t.en,
})

export function LanguageProvider({
  children,
  vaId,
}: {
  children: React.ReactNode
  vaId?:    string
}) {
  const [locale, setLocaleState] = useState<Locale>('en')

  useEffect(() => {
    const stored = localStorage.getItem('higherup_language') as Locale | null
    if (stored && (stored === 'en' || stored === 'fil' || stored === 'id')) {
      setLocaleState(stored)
    }
  }, [])

  function setLocale(l: Locale) {
    setLocaleState(l)
    localStorage.setItem('higherup_language', l)
    if (vaId) {
      void supabase
        .from('vas')
        .update({ preferred_language: l })
        .eq('id', vaId)
    }
  }

  return (
    <Ctx.Provider value={{ locale, setLocale, tr: t[locale] }}>
      {children}
    </Ctx.Provider>
  )
}

export const useLanguage = () => useContext(Ctx)
