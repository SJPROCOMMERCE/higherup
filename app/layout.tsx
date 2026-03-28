import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { VAProvider } from '@/context/va-context'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'HigherUp',
  description: 'AI-powered listing optimization for Virtual Assistants',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-white text-[#1D1D1F] antialiased" suppressHydrationWarning>
        <VAProvider>{children}</VAProvider>
      </body>
    </html>
  )
}
