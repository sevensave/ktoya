import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Общие стили — до экранов: стили экранов идут после и перекрывают их.
import './styles/base.css'
import './components/ui.css'
import './components/chrome.css'
import { App } from './App'
import './audio/sound'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
