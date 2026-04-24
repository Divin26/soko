import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ResetPassword from './components/ResetPassword'
import './index.css'

// Check if we're on the reset password page
const isResetPage = window.location.pathname === '/reset-password'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isResetPage ? <ResetPassword /> : <App />}
  </React.StrictMode>
)