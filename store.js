const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ============ GLOBAL CONFIG (app-wide) ============

async function getConfig() {
  const { data } = await supabase.from('config').select('key, value');
  const config = {};
  if (data) data.forEach(row => { config[row.key] = row.value; });
  return config;
}

async function setConfigKey(key, value) {
  await supabase.from('config').upsert({ key, value }, { onConflict: 'key' });
}

async function deleteConfigKey(key) {
  await supabase.from('config').delete().eq('key', key);
}

// ============ USER CONFIG (per-user Gmail + signature) ============

async function getUserConfig(userId) {
  const { data } = await supabase.from('user_configs').select('key, value').eq('user_id', userId);
  const config = {};
  if (data) data.forEach(row => { config[row.key] = row.value; });
  return config;
}

async function setUserConfigKey(userId, key, value) {
  await supabase.from('user_configs').upsert({ user_id: userId, key, value }, { onConflict: 'user_id,key' });
}

async function deleteUserConfigKey(userId, key) {
  await supabase.from('user_configs').delete().eq('user_id', userId).eq('key', key);
}

// ============ TEMPLATES (shared) ============

function formatTemplate(t) {
  return {
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
    attachment_url: t.attachment_url || null,
    attachment_name: t.attachment_name || null
  };
}

async function getTemplates() {
  const { data } = await supabase.from('templates').select('*').order('created_at');
  return (data || []).map(formatTemplate);
}

async function addTemplate({ name, subject, body, attachment_url, attachment_name }) {
  const { data, error } = await supabase.from('templates')
    .insert({ name, subject, body, attachment_url: attachment_url || null, attachment_name: attachment_name || null })
    .select().single();
  if (error) throw error;
  return formatTemplate(data);
}

async function updateTemplate(id, { name, subject, body, attachment_url, attachment_name }) {
  const { data, error } = await supabase.from('templates')
    .update({ name, subject, body, attachment_url: attachment_url || null, attachment_name: attachment_name || null })
    .eq('id', id).select().single();
  if (error) throw error;
  return formatTemplate(data);
}

async function setTemplateAttachment(id, attachment_url, attachment_name) {
  const { error } = await supabase.from('templates')
    .update({ attachment_url, attachment_name })
    .eq('id', id);
  if (error) throw error;
}

async function clearTemplateAttachment(id) {
  const { error } = await supabase.from('templates')
    .update({ attachment_url: null, attachment_name: null })
    .eq('id', id);
  if (error) throw error;
}

async function deleteTemplate(id) {
  const { error } = await supabase.from('templates').delete().eq('id', id);
  if (error) throw error;
}

module.exports = {
  supabase,
  getConfig, setConfigKey, deleteConfigKey,
  getUserConfig, setUserConfigKey, deleteUserConfigKey,
  getTemplates, addTemplate, updateTemplate, deleteTemplate,
  setTemplateAttachment, clearTemplateAttachment
};
