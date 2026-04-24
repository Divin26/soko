import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const inputStyle = { width: '100%', padding: '11px 14px', border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }
const btnGreen = { width: '100%', padding: '13px', background: 'linear-gradient(135deg,#00B87A,#00D68F)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }

function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const hash = window.location.hash
    if (!hash || !hash.includes('access_token')) {
      setError('Invalid or expired reset link. Please request a new one.')
    }
  }, [])

  async function handleReset() {
    if (!password || !confirmPassword) {
      setError('Please fill in both password fields')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setMessage('Password updated successfully! Redirecting to login...')
      setTimeout(() => {
        window.location.href = '/'
      }, 2000)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#0A1628,#0F2E1A)', fontFamily: 'sans-serif', padding: '20px' }}>
      <div style={{ background: '#fff', borderRadius: '20px', padding: '36px 32px', width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontWeight: 800, margin: 0 }}>SO<span style={{ color: '#00B87A' }}>KO</span></h1>
          <p style={{ color: '#6B7280', marginTop: '8px' }}>Reset your password</p>
        </div>
        {message && <div style={{ background: '#E6FAF4', color: '#007A4D', padding: '12px', borderRadius: '8px', marginBottom: '16px', textAlign: 'center' }}>{message}</div>}
        {error && <div style={{ background: '#FDECEA', color: '#E53935', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>New Password</label>
          <input type="password" style={inputStyle} placeholder="Min 6 characters" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div style={{ marginBottom: '24px' }}>
          <label style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px', display: 'block' }}>Confirm New Password</label>
          <input type="password" style={inputStyle} placeholder="Confirm your password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
        </div>
        <button onClick={handleReset} disabled={loading} style={btnGreen}>
          {loading ? 'Updating...' : 'Update Password →'}
        </button>
      </div>
    </div>
  )
}

export default ResetPassword