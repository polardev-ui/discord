import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.db')
const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vanity TEXT UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    guild_name TEXT NOT NULL,
    guild_icon TEXT,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    clicks INTEGER DEFAULT 0
  )
`)

const insert = db.prepare(
  `INSERT INTO links (vanity, original_url, guild_id, guild_name, guild_icon, created_by)
   VALUES (?, ?, ?, ?, ?, ?)`
)
const findByVanity = db.prepare('SELECT * FROM links WHERE vanity = ?')
const findByUser = db.prepare('SELECT * FROM links WHERE created_by = ? ORDER BY created_at DESC')
const incrementClicks = db.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?')
const remove = db.prepare('DELETE FROM links WHERE id = ?')
const getById = db.prepare('SELECT * FROM links WHERE id = ?')

export function createLink(vanity, originalUrl, guildId, guildName, guildIcon, createdBy) {
  insert.run(vanity, originalUrl, guildId, guildName, guildIcon, createdBy)
  return findByVanity.get(vanity)
}
export function getLinkByVanity(vanity) { return findByVanity.get(vanity) }
export function getLinksByUser(userId) { return findByUser.all(userId) }
export function recordClick(id) { incrementClicks.run(id) }
export function deleteLink(id) { remove.run(id) }
export function getLinkById(id) { return getById.get(id) }
