// Development-only UI. Tokens use sessionStorage here; React Native must use secure device storage.
const BACKEND_URL = "http://localhost:8080";
const GOOGLE_CLIENT_ID = "491728559092-frggmogjfh3mmh0kkduuk11053lucfp3.apps.googleusercontent.com";
const ACCESS_KEY = "englishai_access_token";
const REFRESH_KEY = "englishai_refresh_token";

const $ = (id) => document.getElementById(id);
const loginView = $("login-view"), homeView = $("home-view"), message = $("message");
const setMessage = (text = "") => { message.textContent = text; $("home-message").textContent = text; };
const tokens = () => ({ accessToken: sessionStorage.getItem(ACCESS_KEY), refreshToken: sessionStorage.getItem(REFRESH_KEY) });
const saveTokens = (data) => { if (data.accessToken && data.refreshToken) { sessionStorage.setItem(ACCESS_KEY, data.accessToken); sessionStorage.setItem(REFRESH_KEY, data.refreshToken); } };
const clearSession = () => { sessionStorage.removeItem(ACCESS_KEY); sessionStorage.removeItem(REFRESH_KEY); };

async function request(path, options = {}) {
  const response = await fetch(`${BACKEND_URL}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  let body = null; try { body = await response.json(); } catch (_) { /* 204 */ }
  return { response, body };
}

async function loginLocal(event) {
  event.preventDefault(); setMessage("");
  try {
    const { response, body } = await request("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: $("email").value, password: $("password").value }) });
    if (!response.ok) { setMessage(response.status === 403 ? "Verifique seu email antes de entrar" : response.status === 401 ? "Email ou senha inválidos" : "Não foi possível entrar"); return; }
    saveTokens(body); await showHome();
  } catch (_) { setMessage("Não foi possível conectar ao servidor"); }
}

async function loadCurrentUser() {
  const current = tokens();
  if (!current.accessToken) return null;
  let result = await request("/api/v1/users/me", { headers: { Authorization: `Bearer ${current.accessToken}` } });
  if (result.response.status === 401 && current.refreshToken) {
    const refreshed = await request("/api/v1/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: current.refreshToken }) });
    if (refreshed.response.ok && refreshed.body?.accessToken && refreshed.body?.refreshToken) {
      saveTokens(refreshed.body);
      const next = tokens();
      result = await request("/api/v1/users/me", { headers: { Authorization: `Bearer ${next.accessToken}` } });
    }
  }
  if (result.response.ok) return result.body;
  clearSession(); return null;
}

async function showHome() {
  const user = await loadCurrentUser();
  if (!user) { loginView.hidden = false; homeView.hidden = true; setMessage("Sua sessão expirou"); return; }
  $("username").textContent = user.username || ""; $("user-email").textContent = user.email || "";
  $("verified").textContent = user.emailVerified === true ? "Sim" : user.emailVerified === false ? "Não" : "Não informado"; loginView.hidden = true; homeView.hidden = false; setMessage("");
}

async function prepareGoogle() {
  if (!window.google?.accounts?.id || GOOGLE_CLIENT_ID.startsWith("COLOQUE")) { setMessage("Configure GOOGLE_CLIENT_ID no app.js"); return; }
  try {
    const nonceResult = await request("/api/v1/auth/google/nonce", { method: "POST" });
    if (!nonceResult.response.ok || !nonceResult.body?.nonce) throw new Error();
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, nonce: nonceResult.body.nonce, callback: async (credential) => {
      try {
        const result = await request("/api/v1/auth/google", { method: "POST", body: JSON.stringify({ credential: credential.credential, nonce: nonceResult.body.nonce }) });
        if (!result.response.ok) { setMessage("Não foi possível entrar com Google"); await prepareGoogle(); return; }
        saveTokens(result.body); await showHome();
      } catch (_) { setMessage("Não foi possível conectar ao servidor"); await prepareGoogle(); }
    }});
    $("google-button").replaceChildren(); google.accounts.id.renderButton($("google-button"), { theme: "outline", size: "large" });
  } catch (_) { setMessage("Não foi possível conectar ao servidor"); }
}

async function logout() {
  const refreshToken = tokens().refreshToken;
  try { if (refreshToken) await request("/api/v1/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }); }
  finally { clearSession(); loginView.hidden = false; homeView.hidden = true; setMessage(""); }
}

$("login-form").addEventListener("submit", loginLocal); $("logout").addEventListener("click", logout);
const googleScript = document.createElement("script"); googleScript.src = "https://accounts.google.com/gsi/client"; googleScript.async = true; googleScript.onload = prepareGoogle; document.head.appendChild(googleScript);
showHome();
