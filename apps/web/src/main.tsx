import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './features/bim/frameLogicMain.css'
import { installPieceWorkspaceChromeGuard } from './features/bim/installPieceWorkspaceChromeGuard.ts'
import App from './App.tsx'

installPieceWorkspaceChromeGuard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
