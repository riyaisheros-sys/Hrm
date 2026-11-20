import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProviders } from '@/providers/AppProviders'
import { App } from '@/App'
import { applyHeadingColour, readCachedHeadingColour } from '@/lib/appearance'
import './index.css'

// Paint the saved table heading colour before the first render.
applyHeadingColour(readCachedHeadingColour())

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

createRoot(rootEl).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
)
