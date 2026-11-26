import { useState } from 'react'
import { readApiResponse } from '../data/readApiResponse'

export default function AccountPage({ user, adminConfigured, localAdminBypass, onAuth, onLogout, onNavigate }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function signOut() {
    setError('')
    try {
      await onLogout()
    } catch (logoutError) {
      setError(logoutError.message || 'Unable to sign out. Please try again.')
    }
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const result = await readApiResponse(response)
      onAuth(result.user)
    } catch (requestError) {
      setError(requestError.message || 'Unable to reach the server. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (user) {
    return (
      <section className="account-page">
        <div className="account-card">
          <p className="eyebrow">Administrator</p>
          <h1>Welcome back</h1>
          <p className="account-email">{user.email}</p>
          {user.role === 'admin' && <button className="primary-button" onClick={() => onNavigate('admin')}>Open admin dashboard</button>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {!localAdminBypass && <button className="text-button" onClick={signOut}>Sign out</button>}
        </div>
      </section>
    )
  }

  return (
    <section className="account-page">
      <form className="account-card" onSubmit={submit}>
        <p className="eyebrow">ExitWay administrator</p>
        <h1>Admin sign in</h1>
        <p className="account-description">Sign in with the administrator username and password to manage the store.</p>
        {!adminConfigured && <p className="form-note">Admin sign-in is disabled until SESSION_SECRET, ADMIN_EMAIL, and ADMIN_PASSWORD are configured on the server. In development, start the site with <code>npm run dev</code>.</p>}
        <label>Admin username or email<input type="text" autoComplete="username" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button account-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : 'Sign in'}</button>
      </form>
    </section>
  )
}
