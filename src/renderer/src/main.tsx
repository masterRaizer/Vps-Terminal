import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import '@fontsource/source-code-pro/400.css'
import '@fontsource/source-code-pro/700.css'
import './styles/app.css'
import { App } from './App'

// No StrictMode: its double-invoked effects would open every SSH session twice.
createRoot(document.getElementById('root')!).render(<App />)
