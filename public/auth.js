// Shared auth helper — included by all pages
let _supabase = null;

async function getSupabase() {
  if (_supabase) return _supabase;
  const res = await fetch('/api/public-config');
  const { supabaseUrl, supabaseAnonKey } = await res.json();
  _supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  return _supabase;
}

async function getSession() {
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

async function requireLogin() {
  const session = await getSession();
  if (!session) {
    window.location.href = '/login.html';
    return null;
  }
  return session;
}

async function logout() {
  const sb = await getSupabase();
  await sb.auth.signOut();
  window.location.href = '/login.html';
}

function authHeaders(session) {
  return { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
}
