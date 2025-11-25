import { createRoot } from 'react-dom/client'
import './base.css'
import './index.css'
import App from './App.tsx'

// Note: StrictMode is disabled because it causes issues with blob URLs
// Blob URLs cannot be "un-revoked" after cleanup, which causes errors
// when StrictMode intentionally unmounts/remounts components in development.
// This has no impact on production builds.
createRoot(document.getElementById('root')!).render(<App />)
