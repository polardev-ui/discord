import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'

const APP_URL = 'https://discord.wsgpolar.me'

function extractInviteCode(url) {
  const m = url.match(/discord\.(?:gg|com\/invite)\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

function isValidVanity(s) {
  return /^[a-zA-Z0-9-]{2,32}$/.test(s)
}

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])
  return (
    <div className={`toast toast-${type}`}>
      <span>{message}</span>
      <button className="toast-close" onClick={onClose}>×</button>
    </div>
  )
}

function getAvatarUrl(user) {
  if (!user.avatar) return `https://cdn.discordapp.com/embed/avatars/${Number(user.discriminator) % 5}.png`
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
}

function getGuildIconUrl(g) {
  if (!g.icon) return null
  return `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png`
}

export default function Dashboard() {
  const { user, logout } = useAuth()

  const [guilds, setGuilds] = useState([])
  const [guildsLoading, setGuildsLoading] = useState(true)
  const [links, setLinks] = useState([])
  const [toast, setToast] = useState(null)

  // Form state
  const [selectedGuild, setSelectedGuild] = useState(null)
  const [inviteUrl, setInviteUrl] = useState('')
  const [vanity, setVanity] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const showToast = useCallback((message, type = 'success') => setToast({ message, type }), [])
  const dismissToast = useCallback(() => setToast(null), [])

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch('/api/links')
      if (res.ok) setLinks(await res.json())
    } catch {}
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const [gRes] = await Promise.all([
          fetch('/api/guilds'),
          fetchLinks(),
        ])
        if (gRes.ok) setGuilds(await gRes.json())
      } catch {} finally {
        setGuildsLoading(false)
      }
    }
    load()
  }, [fetchLinks])

  const detectedCode = extractInviteCode(inviteUrl)
  const previewUrl = vanity && isValidVanity(vanity) ? `/${vanity}` : null
  const canSubmit = selectedGuild && detectedCode && isValidVanity(vanity) && !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vanity: vanity.toLowerCase(),
          guild_id: selectedGuild.id,
          invite_url: inviteUrl,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        showToast(`Created! ${APP_URL}/${vanity.toLowerCase()}`)
        setInviteUrl('')
        setVanity('')
        setSelectedGuild(null)
        fetchLinks()
      } else {
        showToast(data.error || 'Failed to create', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id) {
    const res = await fetch(`/api/links/${id}`, { method: 'DELETE' })
    if (res.ok) { showToast('Deleted'); fetchLinks() }
    else showToast('Failed to delete', 'error')
  }

  function copy(text) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied!'))
  }

  return (
    <div className="dashboard">
      {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}

      <header className="dash-header">
        <div className="dash-header-inner">
          <div className="dash-logo">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#5865F2"/>
              <path d="M20 11L12 16L20 21" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <h1>disvite</h1>
          </div>
          <div className="dash-user">
            <img src={getAvatarUrl(user)} alt="" className="dash-avatar" />
            <span className="dash-username">{user.global_name || user.username}</span>
            <button className="btn btn-ghost" onClick={logout}>Logout</button>
          </div>
        </div>
      </header>

      <main className="dash-main">
        <div className="dash-layout">
          {/* Left: guild selector */}
          <section className="card guilds-section">
            <div className="section-header">
              <h2>Your Servers</h2>
              <span className="badge">{guilds.length}</span>
            </div>
            {guildsLoading ? (
              <p className="loading-text">Loading servers...</p>
            ) : guilds.length === 0 ? (
              <div className="empty">
                <p>No servers with Manage Server permission.</p>
                <p className="text-muted">Make sure you're the server owner or have the Manage Server role.</p>
              </div>
            ) : (
              <div className="guild-list">
                {guilds.map(g => (
                  <button
                    key={g.id}
                    className={`guild-card ${selectedGuild?.id === g.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedGuild(g)
                      setInviteUrl('')
                      setVanity('')
                    }}
                  >
                    {getGuildIconUrl(g) ? (
                      <img src={getGuildIconUrl(g)} alt="" className="guild-icon" />
                    ) : (
                      <div className="guild-icon guild-icon-fallback">{g.name[0].toUpperCase()}</div>
                    )}
                    <div className="guild-info">
                      <span className="guild-name">{g.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Right: form + links */}
          <div className="dash-right">
            {/* Create form */}
            <div className="card form-card">
              <h2>Create Vanity Link</h2>
              {!selectedGuild ? (
                <p className="text-muted" style={{ padding: '12px 0' }}>Select a server from the left to begin.</p>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="selected-guild-badge">
                    {getGuildIconUrl(selectedGuild) ? (
                      <img src={getGuildIconUrl(selectedGuild)} alt="" className="mini-icon" />
                    ) : (
                      <div className="mini-icon mini-icon-fallback">{selectedGuild.name[0].toUpperCase()}</div>
                    )}
                    <span>{selectedGuild.name}</span>
                  </div>

                  <div className="form-group">
                    <label htmlFor="invite">Discord invite URL</label>
                    <input
                      id="invite" type="text"
                      placeholder="https://discord.gg/example"
                      value={inviteUrl}
                      onChange={e => setInviteUrl(e.target.value)}
                    />
                    {detectedCode && (
                      <span className="hint">Invite code: <strong>{detectedCode}</strong></span>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="vanity">Vanity path</label>
                    <div className="input-prefix">
                      <span className="prefix">{APP_URL}/</span>
                      <input
                        id="vanity" type="text"
                        placeholder="your-server-name"
                        value={vanity}
                        onChange={e => setVanity(e.target.value)}
                      />
                    </div>
                    {previewUrl && (
                      <span className="hint">Preview: <strong>{APP_URL}{previewUrl}</strong></span>
                    )}
                  </div>

                  <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
                    {submitting ? 'Creating...' : 'Create Vanity'}
                  </button>
                </form>
              )}
            </div>

            {/* Links list */}
            <div className="card list-card">
              <div className="section-header">
                <h2>Your Vanities</h2>
                <span className="badge">{links.length}</span>
              </div>
              {links.length === 0 ? (
                <div className="empty">
                  <p>No vanity links yet.</p>
                </div>
              ) : (
                <div className="link-list">
                  {links.map(link => (
                    <div key={link.id} className="link-item">
                      <div className="link-guild-icon">
                        {link.guild_icon ? (
                          <img src={link.guild_icon} alt="" className="mini-icon" />
                        ) : (
                          <div className="mini-icon mini-icon-fallback">{link.guild_name[0]}</div>
                        )}
                      </div>
                      <div className="link-info">
                        <a href={`/${link.vanity}`} target="_blank" rel="noopener noreferrer" className="link-vanity">
                          /{link.vanity}
                        </a>
                        <span className="link-original">{link.guild_name}</span>
                        <span className="link-clicks">{link.clicks} clicks</span>
                      </div>
                      <div className="link-actions">
                        <button className="btn btn-icon" onClick={() => copy(`${APP_URL}/${link.vanity}`)} title="Copy">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                        </button>
                        <button className="btn btn-icon btn-danger" onClick={() => handleDelete(link.id)} title="Delete">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
