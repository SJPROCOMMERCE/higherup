'use client'

import { useVA } from '@/context/va-context'

export default function SuccessCenter() {
  const { currentVA } = useVA()
  const firstName = currentVA?.name?.split(' ')[0] || ''

  return (
    <div style={{
      minHeight: '80vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 24px',
    }}>
      <div style={{ maxWidth: 440, width: '100%' }}>

        <p style={{ fontSize: 28, fontWeight: 300, color: '#111111', lineHeight: 1.3, margin: 0 }}>
          {firstName ? `Hey ${firstName},` : 'Hey,'}
        </p>

        <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <p style={{ fontSize: 15, color: '#999999', lineHeight: 1.7, margin: 0 }}>
            We&rsquo;re not done yet.
          </p>

          <p style={{ fontSize: 15, color: '#999999', lineHeight: 1.7, margin: 0 }}>
            Right now, you have the tools to upload, optimize, and deliver. That&rsquo;s the engine.
          </p>

          <p style={{ fontSize: 15, color: '#999999', lineHeight: 1.7, margin: 0 }}>
            But we&rsquo;re building something else.
          </p>

          <p style={{ fontSize: 15, color: '#111111', lineHeight: 1.7, margin: 0 }}>
            Something that helps you find clients.
          </p>

          <p style={{ fontSize: 15, color: '#111111', lineHeight: 1.7, margin: 0 }}>
            Something that shows you exactly how to grow from 3 clients to 15.
          </p>

          <p style={{ fontSize: 15, color: '#999999', lineHeight: 1.7, margin: 0 }}>
            It&rsquo;s almost ready.
          </p>
        </div>

        <p style={{ marginTop: 64, fontSize: 13, color: '#CCCCCC', margin: '64px 0 0' }}>
          — The HigherUp team
        </p>

      </div>
    </div>
  )
}
