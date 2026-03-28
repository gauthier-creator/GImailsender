const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// --- Config ---

async function getConfig() {
  const { data } = await supabase.from('config').select('key, value');
  const config = {};
  if (data) data.forEach(row => { config[row.key] = row.value; });
  return config;
}

async function saveConfig(config) {
  const rows = Object.entries(config).map(([key, value]) => ({ key, value }));
  for (const row of rows) {
    await supabase.from('config').upsert(row, { onConflict: 'key' });
  }
}

// --- Templates ---

async function getTemplates() {
  const { data } = await supabase.from('templates').select('*').order('created_at');
  return (data || []).map(t => ({ id: t.id, name: t.name, subject: t.subject, body: t.body }));
}

async function addTemplate({ name, subject, body }) {
  const { data, error } = await supabase.from('templates').insert({ name, subject, body }).select().single();
  if (error) throw error;
  return { id: data.id, name: data.name, subject: data.subject, body: data.body };
}

async function updateTemplate(id, { name, subject, body }) {
  const { data, error } = await supabase.from('templates').update({ name, subject, body }).eq('id', id).select().single();
  if (error) throw error;
  return { id: data.id, name: data.name, subject: data.subject, body: data.body };
}

async function deleteTemplate(id) {
  const { error } = await supabase.from('templates').delete().eq('id', id);
  if (error) throw error;
}

module.exports = { getConfig, saveConfig, getTemplates, addTemplate, updateTemplate, deleteTemplate };
