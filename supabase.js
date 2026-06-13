/* ============================================================
   M87 — Camada de nuvem (Supabase): login e dados por usuário
   ------------------------------------------------------------
   Preencha SUPABASE_URL e SUPABASE_ANON_KEY com os dados do seu
   projeto (no painel do Supabase: Project Settings → API).
   Se ficarem vazios, o app roda 100% local (sem tela de login).
   ============================================================ */
const SUPABASE_URL = "https://fxuxkzpwwknhofhajvkk.supabase.co";       // ex: https://abcdxyz.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4dXhrenB3d2tuaG9maGFqdmtrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyODIxNTgsImV4cCI6MjA5Njg1ODE1OH0.Kt51uwGtZgmrPiO0DvAnxEi6nJ9TWPMK51NcL_aTdtw";  // a chave "anon public"

const M87Cloud = (() => {
  let client = null;

  function enabled() {
    return !!(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);
  }
  function getClient() {
    if (!client && enabled()) {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return client;
  }

  async function getSession() {
    if (!enabled()) return null;
    const { data } = await getClient().auth.getSession();
    return data.session || null;
  }
  function onAuthChange(cb) {
    if (!enabled()) return;
    getClient().auth.onAuthStateChange((event, session) => cb(event, session));
  }

  async function signIn(email, password) {
    const { data, error } = await getClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data; // { user, session }
  }
  async function signUp(email, password, username) {
    const { data, error } = await getClient().auth.signUp({
      email, password,
      options: { data: { username: username || "" } },
    });
    if (error) throw error;
    return data; // { user, session } (session é null se exigir confirmação por e-mail)
  }
  async function resetPassword(email) {
    const redirectTo = location.href.split("#")[0];
    const { error } = await getClient().auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  }
  async function updatePassword(password) {
    const { error } = await getClient().auth.updateUser({ password });
    if (error) throw error;
  }
  async function signOut() {
    if (enabled()) await getClient().auth.signOut();
  }

  /* Dados: uma linha por usuário na tabela app_data (coluna data jsonb) */
  async function loadData(userId) {
    const { data, error } = await getClient()
      .from("app_data").select("data").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data ? data.data : null;
  }
  async function saveData(userId, payload) {
    const { error } = await getClient().from("app_data")
      .upsert({ user_id: userId, data: payload, updated_at: new Date().toISOString() });
    if (error) throw error;
  }
  async function deleteData(userId) {
    const { error } = await getClient().from("app_data").delete().eq("user_id", userId);
    if (error) throw error;
  }

  /* tempo real: avisa quando a linha do usuário muda (de outro aparelho) */
  function subscribe(userId, cb) {
    if (!enabled()) return null;
    return getClient()
      .channel("m87-" + userId)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "app_data", filter: `user_id=eq.${userId}` },
        payload => cb(payload.new))
      .subscribe();
  }

  return {
    enabled, getSession, onAuthChange,
    signIn, signUp, resetPassword, updatePassword, signOut,
    loadData, saveData, deleteData, subscribe,
  };
})();
