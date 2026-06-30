const API_BASE = 'https://discord.com/api/v10'

const MANAGE_GUILD = BigInt(0x20)

function botHeaders() {
  const token = process.env.DISCORD_BOT_TOKEN
  return { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' }
}

export async function exchangeCode(code, redirectUri) {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })

  const res = await fetch(`${API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed: ${res.status} ${text}`)
  }

  return res.json()
}

export async function refreshToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })

  const res = await fetch(`${API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) return null
  return res.json()
}

export async function getCurrentUser(accessToken) {
  const res = await fetch(`${API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  return res.json()
}

export async function getCurrentUserGuilds(accessToken) {
  const res = await fetch(`${API_BASE}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  return res.json()
}

export function filterManageableGuilds(guilds) {
  return guilds.filter(g => {
    const perms = BigInt(g.permissions)
    return (perms & MANAGE_GUILD) === MANAGE_GUILD
  })
}

export async function getInviteInfo(code) {
  const res = await fetch(`${API_BASE}/invites/${code}?with_counts=true`, {
    headers: botHeaders(),
  })
  if (!res.ok) return null
  return res.json()
}

export async function getGuildChannels(guildId) {
  const res = await fetch(`${API_BASE}/guilds/${guildId}/channels`, {
    headers: botHeaders(),
  })
  if (!res.ok) return null
  return res.json()
}

export async function createChannelInvite(channelId) {
  const res = await fetch(`${API_BASE}/channels/${channelId}/invites`, {
    method: 'POST',
    headers: botHeaders(),
    body: JSON.stringify({
      max_age: 0,
      max_uses: 0,
      unique: true,
    }),
  })
  if (!res.ok) return null
  return res.json()
}
