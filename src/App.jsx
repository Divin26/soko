import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const inputStyle = { width: '100%', padding: '11px 14px', border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }
const labelStyle = { fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px', textTransform: 'uppercase' }
const btnGreen = { width: '100%', padding: '13px', background: 'linear-gradient(135deg,#00B87A,#00D68F)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }
const btnOutline = { width: '100%', padding: '13px', background: 'transparent', color: '#374151', border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '15px', fontWeight: 700, cursor: 'pointer', marginTop: '8px' }

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('email', session.user.email)
            .single()
          if (profile) setUser(profile)
        }
      } catch (e) {
        console.log('Session error:', e)
      } finally {
        setLoading(false)
      }
    }
    checkSession()

    window.addEventListener('message', (e) => {
      if (e.data?.type === 'SOKO_LOGOUT') {
        supabase.auth.signOut()
        localStorage.removeItem('sokoUser')
        setUser(null)
      }
    })
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#131921' }}>
      <div style={{ color: '#FF9900', fontSize: '24px', fontWeight: 700, fontFamily: 'sans-serif' }}>
        🛒 Loading SOKO...
      </div>
    </div>
  )

  if (!user) return <AuthScreen setUser={setUser} />

  localStorage.setItem('sokoUser', JSON.stringify({
    name: user.name,
    role: user.role,
    email: user.email,
    phone: user.phone || ''
  }))

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
      <iframe
        src="/soko.html"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="SOKO Marketplace"
      />
    </div>
  )
}

function AuthScreen({ setUser }) {
  const [tab, setTab] = useState('login')
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#131921', fontFamily: 'sans-serif', padding: '20px' }}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '36px 32px', width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontWeight: 900, margin: '8px 0 4px', fontSize: '28px', fontFamily: 'Outfit, sans-serif' }}>
            SO<span style={{ color: '#FF9900' }}>KO</span>
          </h1>
          <p style={{ color: '#6B7280', fontSize: '13px' }}>🇷🇼 Rwanda's #1 Marketplace</p>
        </div>
        <div style={{ display: 'flex', borderBottom: '2px solid #eee', marginBottom: '24px' }}>
          {['login', 'signup'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '12px', border: 'none', fontWeight: 700, fontSize: '14px', cursor: 'pointer', background: 'transparent', color: tab === t ? '#131921' : '#9CA3AF', borderBottom: tab === t ? '3px solid #FF9900' : '3px solid transparent', marginBottom: '-2px' }}>
              {t === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>
        {tab === 'forgot' ? (
          <ForgotPassword onBack={() => setTab('login')} />
        ) : tab === 'login' ? (
          <Login setUser={setUser} onForgot={() => setTab('forgot')} />
        ) : (
          <Signup setUser={setUser} />
        )}
      </div>
    </div>
  )
}

function Login({ setUser, onForgot }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    if (!email || !password) { setError('Please fill all fields'); return }
    setLoading(true); setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    let { data: profile } = await supabase.from('users').select('*').eq('email', email).single()
    if (!profile) {
      const { data: newProfile } = await supabase
        .from('users')
        .insert([{ name: email.split('@')[0], email, auth_id: data.user.id, role: 'buyer', verified: false, status: 'active' }])
        .select().single()
      profile = newProfile
    }
    setLoading(false)
    setUser(profile)
  }

  return (
    <div>
      {error && <div style={{ background: '#FDECEA', color: '#E53935', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>{error}</div>}
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Email Address</label>
        <input style={inputStyle} placeholder="you@email.com" type="email" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <div style={{ marginBottom: '6px' }}>
        <label style={labelStyle}>Password</label>
        <input type="password" style={inputStyle} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
      </div>
      <div style={{ textAlign: 'right', marginBottom: '16px' }}>
        <span onClick={onForgot} style={{ fontSize: '13px', color: '#FF9900', fontWeight: 600, cursor: 'pointer' }}>Forgot Password?</span>
      </div>
      <button onClick={handleLogin} disabled={loading} style={{ ...btnGreen, background: 'linear-gradient(to bottom,#FFD814,#F7CA00)', color: '#111', border: '1px solid #E47911' }}>
        {loading ? 'Signing in...' : 'Sign in →'}
      </button>
    </div>
  )
}

function Signup({ setUser }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'buyer' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSignup() {
    if (!form.name || !form.email || !form.password) { setError('Name, email and password are required'); return }
    setLoading(true); setError('')
    const { data, error } = await supabase.auth.signUp({ email: form.email, password: form.password })
    if (error) { setError(error.message); setLoading(false); return }
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert([{ name: form.name, email: form.email, phone: form.phone || null, role: form.role, auth_id: data.user.id, verified: false, status: form.role === 'seller' ? 'pending' : 'active' }])
      .select().single()
    setLoading(false)
    if (profileError) { setError('Account created! Please sign in.'); return }
    setUser(profile)
  }

  return (
    <div>
      {error && <div style={{ background: '#FDECEA', color: '#E53935', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        {['buyer', 'seller'].map(r => (
          <div key={r} onClick={() => update('role', r)} style={{ border: `2px solid ${form.role === r ? '#FF9900' : '#E5E7EB'}`, background: form.role === r ? '#FFF8EE' : '#fff', borderRadius: '8px', padding: '12px', textAlign: 'center', cursor: 'pointer' }}>
            <div style={{ fontSize: '24px' }}>{r === 'buyer' ? '🛍️' : '🏪'}</div>
            <div style={{ fontWeight: 700, fontSize: '13px', marginTop: '4px', textTransform: 'capitalize' }}>{r}</div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Full Name</label>
        <input style={inputStyle} placeholder="Jean Mutoni" value={form.name} onChange={e => update('name', e.target.value)} />
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Email Address</label>
        <input style={inputStyle} placeholder="you@email.com" type="email" value={form.email} onChange={e => update('email', e.target.value)} />
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Phone (optional)</label>
        <input style={inputStyle} placeholder="+250 7XX XXX XXX" value={form.phone} onChange={e => update('phone', e.target.value)} />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Password</label>
        <input type="password" style={inputStyle} placeholder="Min 6 characters" value={form.password} onChange={e => update('password', e.target.value)} />
      </div>
      <button onClick={handleSignup} disabled={loading} style={{ ...btnGreen, background: 'linear-gradient(to bottom,#FFD814,#F7CA00)', color: '#111', border: '1px solid #E47911' }}>
        {loading ? 'Creating account...' : 'Create your SOKO account →'}
      </button>
    </div>
  )
}

function ForgotPassword({ onBack }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleReset() {
    if (!email) { setError('Please enter your email'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: 'http://localhost:5173' })
    setLoading(false)
    if (error) { setError(error.message); return }
    setSent(true)
  }

  if (sent) return (
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>📧</div>
      <div style={{ fontWeight: 700, fontSize: '18px', marginBottom: '8px' }}>Check your email!</div>
      <p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '20px' }}>Reset link sent to <strong>{email}</strong></p>
      <button onClick={onBack} style={btnOutline}>← Back to Sign In</button>
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontWeight: 700, fontSize: '18px', marginBottom: '6px' }}>Forgot Password?</div>
        <p style={{ color: '#6B7280', fontSize: '14px' }}>Enter your email and we'll send a reset link.</p>
      </div>
      {error && <div style={{ background: '#FDECEA', color: '#E53935', padding: '10px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' }}>{error}</div>}
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Email Address</label>
        <input style={inputStyle} placeholder="you@email.com" type="email" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <button onClick={handleReset} disabled={loading} style={btnGreen}>
        {loading ? 'Sending...' : 'Send Reset Link →'}
      </button>
      <button onClick={onBack} style={btnOutline}>← Back to Sign In</button>
    </div>
  )
}

export default App