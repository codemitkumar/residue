import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/special-elite/400.css'
import '@fontsource/oswald/500.css'
import '@fontsource/oswald/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/600.css'
import './index.css'
import './phone-map.css'
import './life.css'
import './urge.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
