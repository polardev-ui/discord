import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
}

const supabase = createClient(supabaseUrl, supabaseKey)

export async function createLink(vanity, originalUrl, guildId, guildName, guildIcon, createdBy) {
  const { data, error } = await supabase
    .from('disvite_links')
    .insert({
      vanity,
      original_url: originalUrl,
      guild_id: guildId,
      guild_name: guildName,
      guild_icon: guildIcon,
      created_by: createdBy,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      const customErr = new Error('UNIQUE constraint failed: vanity already exists')
      customErr.originalCode = '23505'
      throw customErr
    }
    throw error
  }
  return data
}

export async function getLinkByVanity(vanity) {
  const { data, error } = await supabase
    .from('disvite_links')
    .select('*')
    .eq('vanity', vanity)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getLinksByUser(userId) {
  const { data, error } = await supabase
    .from('disvite_links')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function recordClick(id) {
  const { error } = await supabase.rpc('increment_click', { link_id: id })
  if (error) throw error
}

export async function deleteLink(id) {
  const { error } = await supabase
    .from('disvite_links')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function getLinkById(id) {
  const { data, error } = await supabase
    .from('disvite_links')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data
}
