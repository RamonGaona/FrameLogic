import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './features/bim/frameLogicMain.css'
import { installPieceWorkspaceChromeGuard } from './features/bim/installPieceWorkspaceChromeGuard.ts'
import App from './App.tsx'

// The standalone Three.js test has no Model Space panels to guard.
if (new URLSearchParams(window.location.search).get("threeNative") !== "1") {
  installPieceWorkspaceChromeGuard()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
