import 'dotenv/config'
import express from 'express'
import session from 'express-session'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  exchangeCode,
  refreshToken,
  getCurrentUser,
  getCurrentUserGuilds,
  filterManageableGuilds,
  getInviteInfo,
} from './discord.js'
import {
  createLink,
  getLinkByVanity,
  getLinksByUser,
  recordClick,
  deleteLink,
  getLinkById,
} from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const APP_URL = process.env.APP_URL || 'http://localhost:3001'
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || `${APP_URL}/api/auth/callback`

app.set('trust proxy', 1)
app.use(express.json())
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: APP_URL.startsWith('https'),
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}))

function isAuthenticated(req) {
  return req.session && req.session.user && req.session.accessToken
}

async function ensureFreshToken(req) {
  if (!req.session.refreshToken) return false
  const data = await refreshToken(req.session.refreshToken)
  if (!data) return false
  req.session.accessToken = data.access_token
  if (data.refresh_token) req.session.refreshToken = data.refresh_token
  return true
}

// ─── Auth routes ────────────────────────────────────────

app.get('/api/auth/discord', (req, res) => {
  const url = new URL('https://discord.com/api/oauth2/authorize')
  url.searchParams.set('client_id', process.env.DISCORD_CLIENT_ID)
  url.searchParams.set('redirect_uri', REDIRECT_URI)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'identify guilds')
  res.redirect(url.toString())
})

app.get('/api/auth/callback', async (req, res) => {
  try {
    const { code } = req.query
    if (!code) return res.redirect('/?error=no_code')

    const tokenData = await exchangeCode(code, REDIRECT_URI)
    const user = await getCurrentUser(tokenData.access_token)
    if (!user) return res.redirect('/?error=user_fetch_failed')

    req.session.user = {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      global_name: user.global_name,
    }
    req.session.accessToken = tokenData.access_token
    req.session.refreshToken = tokenData.refresh_token

    res.redirect('/')
  } catch (err) {
    console.error('Auth callback error:', err)
    res.redirect('/?error=auth_failed')
  }
})

app.get('/api/auth/me', (req, res) => {
  if (!isAuthenticated(req)) return res.json(null)
  res.json(req.session.user)
})

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }))
})

// ─── Guilds ──────────────────────────────────────────────

app.get('/api/guilds', async (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' })
  await ensureFreshToken(req)

  const guilds = await getCurrentUserGuilds(req.session.accessToken)
  if (!guilds) return res.status(502).json({ error: 'Failed to fetch guilds' })

  const manageable = filterManageableGuilds(guilds)
  manageable.sort((a, b) => a.name.localeCompare(b.name))
  res.json(manageable)
})

// ─── Links API ──────────────────────────────────────────

app.post('/api/links', async (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' })

  const { vanity, guild_id, invite_url } = req.body
  if (!vanity || !guild_id || !invite_url) {
    return res.status(400).json({ error: 'vanity, guild_id, and invite_url are required' })
  }

  if (!/^[a-zA-Z0-9-]{2,32}$/.test(vanity)) {
    return res.status(400).json({ error: 'Vanity must be 2-32 chars, letters/numbers/hyphens only' })
  }

  const codeMatch = invite_url.match(/discord\.(?:gg|com\/invite)\/([a-zA-Z0-9_-]+)/)
  if (!codeMatch) return res.status(400).json({ error: 'Invalid Discord invite URL' })
  const inviteCode = codeMatch[1]

  await ensureFreshToken(req)
  const guilds = await getCurrentUserGuilds(req.session.accessToken)
  const userGuild = guilds?.find(g => g.id === guild_id)
  if (!userGuild) return res.status(403).json({ error: 'You do not have access to this server' })

  const perms = BigInt(userGuild.permissions)
  if ((perms & BigInt(0x20)) !== BigInt(0x20)) {
    return res.status(403).json({ error: 'You need Manage Server permission' })
  }

  const inviteInfo = await getInviteInfo(inviteCode)
  if (!inviteInfo) return res.status(400).json({ error: 'Invalid or expired invite link' })

  if (!inviteInfo.guild?.id || inviteInfo.guild.id !== guild_id) {
    return res.status(400).json({ error: 'Invite does not belong to the selected server' })
  }

  const guildIcon = userGuild.icon
    ? `https://cdn.discordapp.com/icons/${userGuild.id}/${userGuild.icon}.png`
    : null

  const finalUrl = `https://discord.gg/${inviteCode}`

  try {
    const link = await createLink(vanity.toLowerCase(), finalUrl, guild_id, userGuild.name, guildIcon, req.session.user.id)
    res.status(201).json(link)
  } catch (err) {
    if (err.message.includes('UNIQUE constraint') || err.originalCode === '23505') {
      return res.status(409).json({ error: 'This vanity name is already taken' })
    }
    console.error('Create error:', err)
    res.status(500).json({ error: 'Failed to create link' })
  }
})

app.get('/api/links', async (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' })
  try {
    const links = await getLinksByUser(req.session.user.id)
    res.json(links)
  } catch {
    res.status(500).json({ error: 'Failed to fetch links' })
  }
})

app.delete('/api/links/:id', async (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' })
  try {
    const link = await getLinkById(Number(req.params.id))
    if (!link) return res.status(404).json({ error: 'Not found' })
    if (link.created_by !== req.session.user.id) {
      return res.status(403).json({ error: 'Not yours to delete' })
    }
    await deleteLink(link.id)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Failed to delete link' })
  }
})

// ─── Vanity redirect / SPA fallback ────────────────────

app.get('/*', async (req, res, next) => {
  const pathname = req.path.slice(1)

  if (pathname && !pathname.includes('.') && !pathname.startsWith('api/')) {
    try {
      const link = await getLinkByVanity(pathname.toLowerCase())
      if (link) {
        await recordClick(link.id)
        return res.redirect(301, link.original_url)
      }
    } catch {
      // fall through to SPA
    }
  }

  const clientDist = path.join(__dirname, '..', 'dist')
  const staticHandler = express.static(clientDist, { maxAge: '1y', immutable: true })

  staticHandler(req, res, () => {
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) {
        res.status(200).send('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Disvite</title></head><body style="background:#1e1f22;color:#f2f3f5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;"><p>Server running.</p></body></html>')
      }
    })
  })
})

export default app
