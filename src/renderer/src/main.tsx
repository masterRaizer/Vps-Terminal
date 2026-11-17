import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './styles/app.css'
import { App } from './App'

// No StrictMode: its double-invoked effects would open every SSH session twice.
createRoot(document.getElementById('root')!).render(<App />)
