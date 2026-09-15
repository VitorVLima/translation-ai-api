// Development-only UI. Tokens remain only in sessionStorage.
const BACKEND_URL = "http://localhost:8080";
const GOOGLE_CLIENT_ID = "491728559092-frggmogjfh3mmh0kkduuk11053lucfp3.apps.googleusercontent.com";
const ACCESS_KEY = "englishai_access_token", REFRESH_KEY = "englishai_refresh_token";

let chatHistory = [];
let scenarioCatalog = [], avatarCatalog = [];
let conversationLoadVersion = 0, pendingConversationCreation = null;
const appState = { currentUser: null, profile: null, avatars: avatarCatalog, currentConversation: null, currentView: null, sidebarCollapsed: globalThis.localStorage?.getItem("englishai_sidebar_collapsed") === "true" };
const $ = id => document.getElementById(id);
const loginView = $("login-view"), appView = $("app-view");
const tokens = () => ({ accessToken: sessionStorage.getItem(ACCESS_KEY), refreshToken: sessionStorage.getItem(REFRESH_KEY) });
const saveTokens = data => { if (data?.accessToken && data?.refreshToken) { sessionStorage.setItem(ACCESS_KEY, data.accessToken); sessionStorage.setItem(REFRESH_KEY, data.refreshToken); } };
const clearSession = () => { sessionStorage.removeItem(ACCESS_KEY); sessionStorage.removeItem(REFRESH_KEY); };
const setMessage = (id, text = "", success = false) => {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle("success", success);
  el.classList.toggle("info", !success && ["Transcrevendo..."].includes(text));
};
function setButtonBusy(button, busy) {
  button.setAttribute("aria-busy", String(busy));
  button.classList.toggle("is-loading", busy);
}
function applySidebarState() {
  const appLayout = document.querySelector?.(".app-layout");
  const toggle = $("sidebar-toggle");
  if (!appLayout || !toggle) return;
  appLayout.classList.toggle("sidebar-collapsed", appState.sidebarCollapsed);
  toggle.setAttribute("aria-expanded", String(!appState.sidebarCollapsed));
  toggle.setAttribute("aria-label", appState.sidebarCollapsed ? "Expandir menu" : "Recolher menu");
  toggle.title = appState.sidebarCollapsed ? "Expandir menu" : "Recolher menu";
  toggle.innerHTML = appState.sidebarCollapsed ? '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 6 6 6-6 6M4 12h12"/></svg>' : '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12"/></svg>';
}
const errorMessage = status => status === 400 ? "Verifique os dados informados." : status === 429 ? "Muitas solicitações. Tente novamente em instantes." : status === 503 ? "O serviço de IA está temporariamente indisponível." : status === 401 ? "Sua sessão expirou." : "Não foi possível concluir a operação.";

async function request(path, options = {}) {
  const { responseType = "json", ...fetchOptions } = options;
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && options.body !== undefined && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(`${BACKEND_URL}${path}`, { ...fetchOptions, headers });
  let body = null;
  if (responseType === "blob") { if (response.ok) body = await response.blob(); }
  else { try { body = await response.json(); } catch (_) {} }
  return { response, body };
}
async function authenticatedRequest(path, options = {}) {
  const current = tokens();
  let result = await request(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${current.accessToken || ""}` } });
  if (result.response.status !== 401 || !current.refreshToken) return result;
  let refreshed;
  try { refreshed = await request("/api/v1/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: current.refreshToken }), signal: options.signal }); }
  catch (_) { return { ...result, networkError: true }; }
  if (!refreshed.response.ok || !refreshed.body?.accessToken || !refreshed.body?.refreshToken) {
    return refreshed.response.status === 400 || refreshed.response.status === 401
      ? { ...result, sessionInvalid: true } : { ...result, networkError: true };
  }
  options.signal?.throwIfAborted();
  saveTokens(refreshed.body);
  return request(path, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${refreshed.body.accessToken}` } });
}
async function authenticatedStream(path, options = {}) {
  const current = tokens();
  let response = await fetch(`${BACKEND_URL}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}), Authorization: `Bearer ${current.accessToken || ""}` } });
  if (response.status !== 401 || !current.refreshToken) return response;
  let refreshed;
  try { refreshed = await request("/api/v1/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: current.refreshToken }), signal: options.signal }); } catch (_) { return response; }
  if (!refreshed.response.ok || !refreshed.body?.accessToken || !refreshed.body?.refreshToken) return response;
  options.signal?.throwIfAborted();
  saveTokens(refreshed.body);
  return fetch(`${BACKEND_URL}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}), Authorization: `Bearer ${refreshed.body.accessToken}` } });
}
function showLogin(message = "", clear = true) { clearCurrentConversation(); appState.currentUser = null; appState.profile = null; scenarioCatalog = []; if (clear) clearSession(); loginView.hidden = false; appView.hidden = true; $("skip-link").setAttribute("href", "#login-form"); setMessage("message", message); }
function validConversation(conversation) {
  return conversation && typeof conversation.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversation.id)
    && typeof conversation.scenario === "string" && /^[A-Z][A-Z0-9_]{2,63}$/.test(conversation.scenario)
    && typeof conversation.assistantDisplayName === "string" && conversation.assistantDisplayName.trim()
    && typeof conversation.assistantAvatarKey === "string" && conversation.assistantAvatarKey.trim()
    && typeof conversation.assistantAvatarImageUrl === "string" && conversation.assistantAvatarImageUrl.trim()
    && ["en", "pt"].includes(conversation.language);
}
function clearCurrentConversation() {
  conversationLoadVersion++;
  cancelConversation();
  appState.currentConversation = null;
  chatHistory = [];
  $("chat-messages").replaceChildren();
  $("chat-message").value = "";
  $("chat-count").textContent = "0";
  $("chat-language").disabled = false;
  $("view-chat").hidden = true;
  setAssistantAvatar(null);
}
function requireCurrentConversation() {
  if (appState.currentUser && validConversation(appState.currentConversation)) return appState.currentConversation;
  showView("scenarios");
  return null;
}
function showView(name) {
  if (name === "chat" && (!appState.currentUser || !validConversation(appState.currentConversation))) name = "scenarios";
  if (name !== "chat") clearCurrentConversation();
  appState.currentView = name;
  document.querySelectorAll(".page-view").forEach(v => v.hidden = v.id !== `view-${name}`);
  document.querySelectorAll("[data-view]").forEach(b => {
    b.classList.toggle("active", b.dataset.view === name);
    b.setAttribute("aria-current", b.dataset.view === name ? "page" : "false");
  });
  if (name === "scenarios" && appState.currentUser) return loadScenarios().catch(() => setMessage("scenario-status", "Não foi possível carregar os cenários."));
  if (name === "conversations" && appState.currentUser) return loadConversations().catch(() => setMessage("conversation-status", "Não foi possível carregar as conversas."));
}

function chatScrollBehavior() { return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth"; }
function elapsed(start) { return `Concluído em ${((performance.now() - start) / 1000).toFixed(1)} s`; }
async function loadCurrentUser() {
  const current = tokens();
  if (!current.accessToken && !current.refreshToken) return { kind: "none" };
  try {
    const result = await authenticatedRequest("/api/v1/users/me");
    if (result.response.ok) return { kind: "user", user: result.body };
    if (result.networkError) return { kind: "network" };
    if (result.sessionInvalid || result.response.status === 401) return { kind: "expired" };
    return { kind: "error" };
  } catch (_) { return { kind: "network" }; }
}

async function loginLocal(event) {
  event.preventDefault(); setMessage("message"); const button = event.submitter; button.disabled = true; setButtonBusy(button, true);
  try { const result = await request("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: $("email").value, password: $("password").value }) });
    if (!result.response.ok) { setMessage("message", result.response.status === 403 ? "Verifique seu email antes de entrar." : result.response.status === 401 ? "Email ou senha inválidos." : "Não foi possível entrar."); return; }
    saveTokens(result.body); await showHome();
  } catch (_) { setMessage("message", "Não foi possível conectar ao servidor."); } finally { button.disabled = false; setButtonBusy(button, false); }
}
async function showHome() { const state=await loadCurrentUser(); if(state.kind!=="user"){if(state.kind==="none")showLogin();else if(state.kind==="expired")showLogin("Sua sessão expirou. Entre novamente.");else showLogin("Não foi possível conectar ao servidor.",false);return;} const user=state.user; clearCurrentConversation(); appState.currentUser=user; try{await loadGlobalProfile();}catch(_){setMessage("profile-status","Não foi possível carregar o perfil.");} loginView.hidden=true;appView.hidden=false;$("skip-link").setAttribute("href","#main-content");["username","header-username","account-username","account-name"].forEach(id=>$(id).textContent=user.username||"");["user-email","account-email"].forEach(id=>$(id).textContent=user.email||"");const verified=user.emailVerified===true?"Sim":user.emailVerified===false?"Não":"Não informado";$("verified").textContent=verified;$("account-verified").textContent=verified;showView("scenarios");}

async function runAi({ buttonId, statusId, path, body, onSuccess, loading }) {
  const button = $(buttonId), start = performance.now(); button.disabled = true; setButtonBusy(button, true); button.textContent = loading; setMessage(statusId);
  try { const result = await authenticatedRequest(path, { method: "POST", body: JSON.stringify(body) }); if (result.response.ok) { onSuccess(result.body); setMessage(statusId, elapsed(start), true); return result; } if (result.networkError) setMessage(statusId, "Não foi possível conectar ao servidor."); else if (result.sessionInvalid || result.response.status === 401) showLogin("Sua sessão expirou. Entre novamente."); else setMessage(statusId, errorMessage(result.response.status)); return result; }
  catch (_) { setMessage(statusId, "Não foi possível conectar ao servidor."); return null; } finally { button.disabled = false; setButtonBusy(button, false); button.textContent = buttonId === "translate" ? "Traduzir" : buttonId === "correct" ? "Corrigir" : "Explicar correção"; }
}
async function translate() { const text = $("translation-text").value, sourceLanguage = $("source-language").value, targetLanguage = $("target-language").value; $("translation-result").value = ""; if (!text.trim()) return setMessage("translation-status", "Digite um texto para traduzir."); if (sourceLanguage === targetLanguage) return setMessage("translation-status", "Escolha idiomas diferentes."); if (text.length > 5000) return setMessage("translation-status", "O texto deve ter no máximo 5000 caracteres."); await runAi({ buttonId: "translate", statusId: "translation-status", path: "/api/v1/translate", body: { text, sourceLanguage, targetLanguage }, loading: "Traduzindo...", onSuccess: data => { $("translation-result").value = data?.translation || ""; } }); }
async function correct() { const text = $("correction-text").value, language = $("correction-language").value; $("corrected-result").value = ""; $("explain-correction").disabled = true; $("explanation-card").hidden = true; if (!text.trim()) return setMessage("correction-status", "Digite um texto para corrigir."); if (text.length > 5000) return setMessage("correction-status", "O texto deve ter no máximo 5000 caracteres."); await runAi({ buttonId: "correct", statusId: "correction-status", path: "/api/v1/correct", body: { text, language }, loading: "Corrigindo...", onSuccess: data => { $("corrected-result").value = data?.correctedText || ""; $("explain-correction").disabled = false; if (data?.correctedText === text) setMessage("correction-status", "O texto já está correto.", true); } }); }
async function explainCorrection() { const originalText = $("correction-text").value, correctedText = $("corrected-result").value, language = $("correction-language").value; await runAi({ buttonId: "explain-correction", statusId: "explanation-status", path: "/api/v1/correct/explain", body: { originalText, correctedText, language }, loading: "Gerando explicação...", onSuccess: data => { $("explanation-result").textContent = data?.explanation || ""; $("explanation-card").hidden = false; } }); }

async function prepareGoogle() { if (!window.google?.accounts?.id || GOOGLE_CLIENT_ID.startsWith("COLOQUE")) return setMessage("message", "Configure GOOGLE_CLIENT_ID no app.js."); try { const nonceResult = await request("/api/v1/auth/google/nonce", { method: "POST" }); if (!nonceResult.response.ok || !nonceResult.body?.nonce) throw new Error(); const nonce = nonceResult.body.nonce; google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, nonce, callback: async credential => { try { const result = await request("/api/v1/auth/google", { method: "POST", body: JSON.stringify({ credential: credential.credential, nonce }) }); if (!result.response.ok) { setMessage("message", "Não foi possível entrar com Google."); return prepareGoogle(); } saveTokens(result.body); await showHome(); } catch (_) { setMessage("message", "Não foi possível conectar ao servidor."); } } }); $("google-button").replaceChildren(); google.accounts.id.renderButton($("google-button"), { theme: "outline", size: "large", width: 280 }); } catch (_) { setMessage("message", "Não foi possível conectar ao servidor."); } }
async function logout() { clearCurrentConversation(); const refreshToken = tokens().refreshToken; try { if (refreshToken) await request("/api/v1/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }); } finally { showLogin(); } }

document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
$("sidebar-toggle")?.addEventListener("click", () => { appState.sidebarCollapsed = !appState.sidebarCollapsed; globalThis.localStorage?.setItem("englishai_sidebar_collapsed", String(appState.sidebarCollapsed)); applySidebarState(); });
const profileHeaderLink = document.querySelector?.(".user-chip");
if (profileHeaderLink) { profileHeaderLink.id = "profile-header-link"; profileHeaderLink.setAttribute("role", "button"); profileHeaderLink.setAttribute("tabindex", "0"); profileHeaderLink.setAttribute("title", "Abrir perfil"); profileHeaderLink.setAttribute("aria-label", "Abrir perfil"); }
profileHeaderLink?.addEventListener("click", event => { if (event.target.closest("#logout")) return; showView("profile"); });
profileHeaderLink?.addEventListener("keydown", event => { if ((event.key === "Enter" || event.key === " ") && !event.target.closest("#logout")) { event.preventDefault(); showView("profile"); } });
applySidebarState();
$("login-form").addEventListener("submit", loginLocal); $("chat-form").addEventListener("submit", sendChatStream); $("clear-chat").addEventListener("click", () => showView("scenarios")); $("chat-message").addEventListener("input", () => $("chat-count").textContent = $("chat-message").value.length); $("chat-message").addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); $("chat-form").requestSubmit(); } }); $("logout").addEventListener("click", logout); $("account-logout").addEventListener("click", logout); $("translate").addEventListener("click", translate); $("correct").addEventListener("click", correct); $("explain-correction").addEventListener("click", explainCorrection);
$("translation-text").addEventListener("input", () => $("translation-count").textContent = $("translation-text").value.length); $("record-chat").addEventListener("click", toggleRecording); $("correction-text").addEventListener("input", () => $("correction-count").textContent = $("correction-text").value.length); $("swap-languages").addEventListener("click", () => { const a = $("source-language"), b = $("target-language"), value = a.value; a.value = b.value; b.value = value; });
function appendChatMessage(role,text,pending=false){document.querySelectorAll(".chat-welcome").forEach(el => el.remove());const item=document.createElement("article");item.className="chat-message "+role;const label=document.createElement("strong");label.textContent=role==="user"?"Você":appState.currentConversation?.assistantDisplayName||"";const bubble=document.createElement("p");bubble.className="chat-bubble";bubble.textContent=text;if(pending)bubble.classList.add("pending");item.append(label,bubble);$("chat-messages").append(item);$("chat-messages").scrollTo({top:$('chat-messages').scrollHeight,behavior:chatScrollBehavior()});return {item,bubble};}

// Only the current request/player owns an audio URL; history remains text-only.
let currentSpeech = null;
function setSpeechState(button, state) {
  button.disabled = state === "loading";
  button.setAttribute("data-state", state);
  button.textContent = state === "loading" ? "Gerando áudio..." : state === "playing" ? "Parar" : "Ouvir";
  button.title = state === "playing" ? "Parar áudio" : state === "loading" ? "Gerando áudio..." : "Ouvir resposta";
  button.setAttribute("aria-label", button.title);
  button.setAttribute("aria-busy", String(state === "loading"));
}
function stopSpeech() {
  const speech = currentSpeech;
  if (!speech) return;
  currentSpeech = null;
  speech.controller.abort();
  if (speech.audio) {
    speech.audio.onended = null;
    speech.audio.onerror = null;
    speech.audio.pause();
    speech.audio.removeAttribute("src");
    speech.audio.load();
    speech.audio = null;
  }
  if (speech.url) { URL.revokeObjectURL(speech.url); speech.url = null; }
  setSpeechState(speech.button, "idle");
  if (speech.voice && speech.generation === conversationGeneration) setVoiceState("idle");
  updateConversationControls();
}
async function playSpeech(button, output, text, language, automatic = false, pipelineStarted) {
  if (recordingOperation || activeChat) return;
  if (currentSpeech?.button === button) {
    if (button.disabled) return;
    stopSpeech();
    return;
  }
  stopSpeech();
  output.textContent = "";
  output.hidden = true;
  const speech = { button, controller: new AbortController(), audio: null, url: null,
    voice: isVoiceMode(), generation: conversationGeneration, start: performance.now() };
  currentSpeech = speech;
  setSpeechState(button, "loading");
  if (speech.voice) setVoiceState("generating_speech");
  updateConversationControls();
  const fail = message => {
    if (currentSpeech !== speech) return;
    stopSpeech();
    output.textContent = automatic ? "Não foi possível reproduzir a resposta em áudio. " + message : message;
    output.hidden = false;
  };
  let result;
  try {
    result = await authenticatedRequest("/api/v1/speech", {
      method: "POST", body: JSON.stringify({ text, language }),
      responseType: "blob", signal: speech.controller.signal
    });
  } catch (_) { fail("Não foi possível conectar ao servidor."); return; }
  // A superseded request must never create a URL or start playback.
  if (currentSpeech !== speech) return;
  if (result.networkError) { fail("Não foi possível conectar ao servidor."); return; }
  if (result.sessionInvalid || result.response.status === 401) {
    stopSpeech();
    showLogin("Sua sessão expirou. Entre novamente.");
    return;
  }
  if (!result.response.ok) {
    const messages = {
      400: "Não foi possível gerar áudio para esse texto.",
      429: "Muitas solicitações. Tente novamente em instantes.",
      503: "O serviço de voz está temporariamente indisponível."
    };
    fail(messages[result.response.status] || "Não foi possível gerar áudio para esse texto.");
    return;
  }
  addChatMetric(output.parentElement, "TTS", speech.start);
  try {
    speech.url = URL.createObjectURL(result.body);
    speech.audio = new Audio(speech.url);
    speech.audio.onended = () => { if (currentSpeech === speech) stopSpeech(); };
    speech.audio.onerror = () => fail("Não foi possível reproduzir o áudio.");
    await speech.audio.play();
    if (currentSpeech === speech) {
      if (automatic && Number.isFinite(pipelineStarted)) addChatMetric(output.parentElement, "Pipeline total", pipelineStarted);
      setSpeechState(button, "playing");
      if (speech.voice) setVoiceState("playing");
      updateConversationControls();
    }
  } catch (_) { fail("Não foi possível reproduzir o áudio."); }
}
function appendSpeechAction(actions, item, reply, language) {
  if (typeof reply !== "string" || !reply.trim() || !["en", "pt"].includes(language) || item.classList.contains("error")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary small-action speech-action";
  setSpeechState(button, "idle");
  const output = document.createElement("p");
  output.className = "message";
  output.hidden = true;
  output.setAttribute("role", "status");
  output.setAttribute("aria-live", "polite");
  // Capture the final reply and its conversation language, never auxiliary text.
  button.addEventListener("click", () => playSpeech(button, output, reply, language));
  actions.append(button);
  item.append(output);
  return { play: (automatic, pipelineStarted) => playSpeech(button, output, reply, language, automatic, pipelineStarted) };
}



let conversationGeneration = 0, activeChat = null, recordingOperation = null;
let voiceState = "idle";
let recorder = null, recorderStream = null, recordingState = "idle";
const isVoiceMode = () => $("chat-mode").value === "voice";
const voiceLabels = {
  idle: "Pronto para falar", recording: "Gravando...", transcribing: "Transcrevendo...",
  waiting_chat: "Pensando...", streaming: "Resposta chegando...",
  generating_speech: "Gerando áudio...", playing: "Reproduzindo resposta..."
};
function setVoiceState(state) {
  voiceState = state;
  $("voice-status").hidden = !isVoiceMode();
  $("voice-status").textContent = voiceLabels[state];
  $("voice-status").setAttribute("data-state", state);
  document.querySelectorAll("[data-chat-mode]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.chatMode === $("chat-mode").value));
  });
  updateConversationControls();
}
function updateConversationControls() {
  const recordingBusy = recordingOperation !== null;
  const voiceBusy = isVoiceMode() && (recordingBusy || activeChat !== null || currentSpeech !== null);
  $("send-chat").disabled = activeChat !== null || (isVoiceMode() && (recordingBusy || currentSpeech !== null));
  $("chat-message").disabled = voiceBusy;
  $("chat-language").disabled = !!appState.currentConversation || recordingBusy || activeChat !== null || voiceBusy;
  const button = $("record-chat");
  button.disabled = recordingState === "acquiring" || recordingState === "processing" || activeChat !== null ||
    (isVoiceMode() && voiceState === "generating_speech");
  button.textContent = recordingState === "recording" ? "Gravando..." :
    recordingState === "processing" ? "Transcrevendo..." :
    recordingState === "acquiring" ? "Abrindo microfone..." : isVoiceMode() ? "Falar" : "Microfone";
  button.title = recordingState === "recording" ? "Parar gravação" : "Gravar mensagem";
  button.setAttribute("aria-label", button.title);
  button.classList.toggle("recording", recordingState === "recording");
  button.setAttribute("data-state", recordingState);
  button.setAttribute("aria-busy", String(recordingState === "acquiring" || recordingState === "processing"));
  document.querySelectorAll(".speech-action").forEach(action => {
    action.disabled = recordingBusy || activeChat !== null ||
      (currentSpeech?.button === action && action.getAttribute("aria-busy") === "true");
  });
}
// Development-only diagnostics; numeric values stay with the DOM, never in chat history.
function showTurnMetric(item, label, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  if (!item.developmentMetrics) {
    const details = document.createElement("details");
    details.className = "dev-metrics";
    const summary = document.createElement("summary");
    summary.textContent = "Métricas de desenvolvimento";
    const list = document.createElement("dl");
    details.append(summary, list);
    item.append(details);
    item.developmentMetrics = { list, rows: new Map() };
  }
  const metrics = item.developmentMetrics;
  let value = metrics.rows.get(label);
  if (!value) {
    const term = document.createElement("dt");
    term.textContent = label;
    value = document.createElement("dd");
    metrics.list.append(term, value);
    metrics.rows.set(label, value);
  }
  value.textContent = `${seconds.toFixed(3)} s`;
}
function addChatMetric(item, label, start) {
  showTurnMetric(item, label, (performance.now() - start) / 1000);
}
function setRecordingState(state, message = "") {
  recordingState = state;
  if (isVoiceMode() && state === "recording") setVoiceState("recording");
  if (isVoiceMode() && state === "processing") setVoiceState("transcribing");
  updateConversationControls();
  if (message) setMessage("chat-status", message);
}
function releaseRecorder() {
  if (recorder) {
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    if (recorder.state !== "inactive") recorder.stop();
  }
  if (recorderStream) recorderStream.getTracks().forEach(track => track.stop());
  recorderStream = null;
  recorder = null;
}
function cancelConversation() {
  conversationGeneration++;
  const chat = activeChat;
  activeChat = null;
  chat?.controller.abort();
  if (chat?.assistant && !chat.complete) {
    setChatResponding(chat.assistant, false);
    chat.assistant.item.classList.add("error");
    chat.assistant.bubble.textContent = "Resposta interrompida.";
  }
  recordingOperation?.controller.abort();
  recordingOperation = null;
  releaseRecorder();
  recordingState = "idle";
  stopSpeech();
  setVoiceState("idle");
  setMessage("chat-status");
}
$("chat-mode").addEventListener("change", cancelConversation);
document.querySelectorAll("[data-chat-mode]").forEach(button => button.addEventListener("click", () => {
  if ($("chat-mode").value === button.dataset.chatMode) return;
  $("chat-mode").value = button.dataset.chatMode;
  $("chat-mode").dispatchEvent(new Event("change"));
}));
window.addEventListener("beforeunload", cancelConversation);
window.addEventListener("pagehide", cancelConversation);

async function transcribeRecording(operation, blob) {
  if (recordingOperation !== operation) return;
  if (!blob.size) {
    recordingOperation = null;
    setRecordingState("idle", "Não foi possível processar o áudio enviado.");
    setVoiceState("idle");
    return;
  }
  setRecordingState("processing", "Transcrevendo...");
  const start = performance.now(), formData = new FormData();
  const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
  formData.append("file", blob, `recording.${extension}`);
  formData.append("language", operation.language);
  try {
    const result = await authenticatedRequest("/api/v1/transcriptions", {
      method: "POST", body: formData, signal: operation.controller.signal
    });
    if (recordingOperation !== operation) return;
    if (!result.response.ok) {
      const messages = {
        400: "Não foi possível processar o áudio enviado.", 413: "O áudio gravado é muito grande.",
        415: "Formato de áudio não suportado.", 429: "Muitas solicitações. Tente novamente em instantes.",
        503: "O serviço de reconhecimento de voz está temporariamente indisponível."
      };
      if (result.networkError) setMessage("chat-status", "Não foi possível conectar ao servidor.");
      else if (result.sessionInvalid || result.response.status === 401) showLogin("Sua sessão expirou. Entre novamente.");
      else setMessage("chat-status", messages[result.response.status] || "Não foi possível processar o áudio enviado.");
      return;
    }
    const text = result.body?.text;
    if (typeof text !== "string" || !text.trim()) {
      setMessage("chat-status", "Não foi possível identificar fala no áudio.");
      return;
    }
    const sttSeconds = (performance.now() - start) / 1000;
    recordingOperation = null;
    setRecordingState("idle");
    if (operation.voice) {
      await sendChatMessage(text, operation.language, { voice: true, generation: operation.generation, sttSeconds, pipelineStarted: operation.processingStarted });
    } else {
      const input = $("chat-message"), separator = input.value && !/\s$/.test(input.value) ? " " : "";
      input.value += separator + text;
      input.dispatchEvent(new Event("input"));
      setMessage("chat-status", `áudio transcrito. Revise a mensagem antes de enviar. STT: ${sttSeconds.toFixed(1)} s`, true);
    }
  } catch (_) {
    if (recordingOperation === operation) setMessage("chat-status", "Não foi possível conectar ao servidor.");
  } finally {
    if (recordingOperation === operation) {
      recordingOperation = null;
      setRecordingState("idle");
      setVoiceState("idle");
    }
  }
}
async function toggleRecording() {
  if ($("record-chat").disabled) return;
  if (recordingState === "recording") {
    recordingOperation.processingStarted = performance.now();
    setRecordingState("processing");
    recorder.stop();
    return;
  }
  if (recordingOperation || activeChat) return;
  stopSpeech();
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    return setRecordingState("idle", "Gravação de áudio não é suportada neste navegador.");
  }
  const operation = { controller: new AbortController(), generation: conversationGeneration,
    voice: isVoiceMode(), language: $("chat-language").value };
  recordingOperation = operation;
  setRecordingState("acquiring");
  setMessage("chat-status");
  const supportsType = typeof MediaRecorder.isTypeSupported === "function";
  const mimeType = supportsType && MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" :
    supportsType && MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (recordingOperation !== operation) { stream.getTracks().forEach(track => track.stop()); return; }
    recorderStream = stream;
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const chunks = [], recordingMimeType = recorder.mimeType || mimeType || "audio/webm";
    recorder.ondataavailable = event => { if (event.data?.size && recordingOperation === operation) chunks.push(event.data); };
    recorder.onerror = () => {
      if (recordingOperation !== operation) return;
      recordingOperation = null;
      chunks.length = 0;
      releaseRecorder();
      setRecordingState("idle", "Não foi possível acessar o microfone.");
      setVoiceState("idle");
    };
    recorder.onstop = async () => {
      if (recordingOperation !== operation) return;
      operation.processingStarted ??= performance.now();
      const blob = new Blob(chunks, { type: recordingMimeType });
      chunks.length = 0;
      releaseRecorder();
      await transcribeRecording(operation, blob);
    };
    recorder.start();
    setRecordingState("recording");
  } catch (error) {
    if (recordingOperation !== operation) return;
    recordingOperation = null;
    releaseRecorder();
    setRecordingState("idle", error?.name === "NotAllowedError" ? "Permissão para usar o microfone foi negada." : "Não foi possível acessar o microfone.");
    setVoiceState("idle");
  }
}
async function chatAction(button,path,body,output,loading){const start=performance.now();button.disabled=true;setButtonBusy(button,true);button.textContent=loading;try{const result=await authenticatedRequest(path,{method:"POST",body:JSON.stringify(body)});if(result.response.ok){output.textContent=result.body?.translation||result.body?.explanation||"";output.hidden=false;const time=document.createElement("small");time.className="chat-time";time.textContent=`Gerado em ${((performance.now()-start)/1000).toFixed(1)} s`;output.parentElement.append(time);}else{output.textContent=result.networkError?"Não foi possível conectar ao servidor.":errorMessage(result.response.status);output.hidden=false;if(result.sessionInvalid||result.response.status===401)showLogin("Sua sessão expirou. Entre novamente.");}}catch(_){output.textContent="Não foi possível conectar ao servidor.";output.hidden=false;}finally{button.disabled=false;setButtonBusy(button,false);button.textContent=path.includes("explain")?"Explicar":"Traduzir";}}

function setChatResponding(assistant, responding) {
  if (!assistant.indicator) {
    assistant.indicator = document.createElement("span");
    assistant.indicator.className = "chat-stream-status";
    assistant.indicator.textContent = `${appState.currentConversation?.assistantDisplayName || "O assistant"} está respondendo...`;
    assistant.indicator.setAttribute("role", "status");
    assistant.item.append(assistant.indicator);
  }
  assistant.indicator.hidden = !responding;
  assistant.item.setAttribute("aria-busy", String(responding));
}

class ChatStreamError extends Error {}
function parseChatEvent(value) {
  try { return JSON.parse(value); }
  catch (_) { throw new ChatStreamError("Invalid stream"); }
}
function renderCompletedReply(assistant, message, language, meta, start, firstToken, options = {}) {
  const reply = assistant.bubble.textContent;
  if (meta.hasCorrection && meta.correctedText) {
    const box = document.createElement("div");
    box.className = "chat-correction";
    const title = document.createElement("strong");
    title.textContent = "Correção sugerida:";
    const corrected = document.createElement("p");
    corrected.textContent = meta.correctedText;
    const explain = document.createElement("button");
    explain.className = "secondary small-action";
    explain.type = "button";
    explain.textContent = "Explicar";
    const explanation = document.createElement("p");
    explanation.className = "chat-result";
    explanation.setAttribute("data-label", "Explicação");
    explanation.setAttribute("aria-label", "Explicação da correção");
    explanation.hidden = true;
    explain.onclick = () => chatAction(explain, "/api/v1/correct/explain",
      { originalText: message, correctedText: meta.correctedText, language }, explanation, "Gerando...");
    box.append(title, corrected, explain, explanation);
    assistant.item.append(box);
  }
  const actions = document.createElement("div");
  actions.className = "chat-actions";
  const translateButton = document.createElement("button");
  translateButton.className = "secondary small-action";
  translateButton.type = "button";
  translateButton.textContent = "Traduzir";
  const translated = document.createElement("p");
  translated.className = "chat-result";
  translated.setAttribute("data-label", "Tradução");
  translated.setAttribute("aria-label", "Tradução da resposta");
  translated.hidden = true;
  translateButton.onclick = () => chatAction(translateButton, "/api/v1/translate",
    { text: reply, sourceLanguage: language, targetLanguage: language === "en" ? "pt" : "en" }, translated, "Traduzindo...");
  actions.append(translateButton);
  const speechAction = appendSpeechAction(actions, assistant.item, reply, language);
  assistant.item.append(actions, translated);
  if (options.sttSeconds !== undefined) showTurnMetric(assistant.item, "STT", options.sttSeconds);
  if (firstToken !== undefined) showTurnMetric(assistant.item, "Chat first token", (firstToken - start) / 1000);
  addChatMetric(assistant.item, "Chat total", start);
  return speechAction;
}
async function sendChatStream(event) {
  event.preventDefault();
  if ($("send-chat").disabled) return;
  const input = $("chat-message"), message = input.value;
  if (!message.trim()) return setMessage("chat-status", "Digite uma mensagem.");
  if (message.length > 5000) return setMessage("chat-status", "A mensagem deve ter no máximo 5000 caracteres.");
  input.value = "";
  $("chat-count").textContent = "0";
  await sendChatMessage(message, $("chat-language").value, { voice: isVoiceMode(), generation: conversationGeneration });
}
async function sendChatMessage(message, language, options) {
  const conversation = requireCurrentConversation();
  if (!conversation) return;
  language = conversation.language;
  if (activeChat || options.generation !== conversationGeneration) return;
  if (typeof message !== "string" || !message.trim()) return;
  if (message.length > 5000) {
    setMessage("chat-status", "A mensagem deve ter no máximo 5000 caracteres.");
    setVoiceState("idle");
    return;
  }
  stopSpeech();
  const chat = { controller: new AbortController(), complete: false, assistant: null };
  activeChat = chat;
  if (options.voice) setVoiceState("waiting_chat");
  updateConversationControls();
  setMessage("chat-status");
  const user = appendChatMessage("user", message);
  if (options.sttSeconds !== undefined) {
    showTurnMetric(user.item, "STT", options.sttSeconds);
  }
  const assistant = appendChatMessage("assistant", "");
  chat.assistant = assistant;
  setChatResponding(assistant, true);
  const start = performance.now();
  let firstToken, reader, speechAction;
  const isCurrent = () => activeChat === chat && options.generation === conversationGeneration;
  try {
    const streamPath = `/api/v1/conversations/${conversation.id}/messages/stream`;
    const streamBody = { message };
    const response = await authenticatedStream(streamPath, {
      method: "POST", body: JSON.stringify(streamBody),
      signal: chat.controller.signal
    });
    if (!isCurrent()) return;
    if (!response.ok) {
      assistant.item.classList.add("error");
      assistant.bubble.textContent = response.status === 400 ? "Verifique a mensagem e o idioma." : errorMessage(response.status);
      if (response.status === 401) showLogin("Sua sessão expirou. Entre novamente.");
      return;
    }
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", eventName = "", data = [];
    const dispatch = () => {
      if (!isCurrent() || chat.complete || !eventName) return;
      const value = data.join("\n"), name = eventName;
      eventName = ""; data = [];
      if (name === "token") {
        const chunk = parseChatEvent(value);
        if (typeof chunk?.text !== "string") throw new ChatStreamError("Invalid stream");
        if (firstToken === undefined) firstToken = performance.now();
        if (options.voice) setVoiceState("streaming");
        assistant.bubble.textContent += chunk.text;
        $("chat-messages").scrollTo({ top: $("chat-messages").scrollHeight, behavior: chatScrollBehavior() });
      } else if (name === "complete") {
        const meta = parseChatEvent(value);
        if (!meta || typeof meta !== "object" || !assistant.bubble.textContent.trim()) throw new ChatStreamError("Invalid stream");
        chat.complete = true;
        setChatResponding(assistant, false);
        chatHistory.push({ role: "user", content: message }, { role: "assistant", content: assistant.bubble.textContent });
        speechAction = renderCompletedReply(assistant, message, language, meta, start, firstToken, options);
      } else if (name === "error") {
        // Never expose arbitrary server/provider error payloads.
        throw new ChatStreamError("Chat failed");
      }
    };
    const consumeLine = line => {
      if (!line) dispatch();
      else if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.startsWith("data: ") ? line.slice(6) : line.slice(5));
    };
    while (!chat.complete && isCurrent()) {
      const part = await reader.read();
      if (!isCurrent()) return;
      buffer += part.done ? decoder.decode() : decoder.decode(part.value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        consumeLine(line);
        if (chat.complete) break;
      }
      if (part.done) {
        if (buffer) consumeLine(buffer);
        dispatch();
        break;
      }
    }
    if (!chat.complete) throw new ChatStreamError("Incomplete stream");
  } catch (error) {
    if (isCurrent() && !chat.complete) {
      assistant.item.classList.add("error");
      assistant.bubble.textContent = error instanceof ChatStreamError ? "O serviço de IA está temporariamente indisponível." :
        "Não foi possível conectar ao servidor.";
    }
  } finally {
    setChatResponding(assistant, false);
    // complete is terminal: cancel the reader instead of waiting for the connection to close.
    if (reader) {
      try { await reader.cancel(); } catch (_) {}
      reader.releaseLock();
    }
    if (isCurrent()) {
      activeChat = null;
      if (options.voice) setVoiceState("idle");
      updateConversationControls();
    }
    $("chat-messages").scrollTo({ top: $("chat-messages").scrollHeight, behavior: chatScrollBehavior() });
  }
  if (chat.complete && options.voice && isVoiceMode() && options.generation === conversationGeneration) {
    await speechAction?.play(true, options.pipelineStarted);
  }
}

function renderAvatars(){const grid=$("avatar-grid");if(!grid)return;grid.replaceChildren();if(!avatarCatalog.length){const empty=document.createElement("p");empty.textContent="Nenhum avatar disponível no momento.";grid.append(empty);return;}for(const a of avatarCatalog){const b=document.createElement("button");b.type="button";b.className="avatar-option";b.title=a.displayName;b.dataset.key=a.key;const img=createAvatarElement({imageUrl:a.imageUrl,alt:`Avatar ${a.displayName}`,className:"profile-option-avatar"});const label=document.createElement("span");label.textContent=a.displayName;b.append(img,label);if(currentProfile?.avatarKey===a.key)b.classList.add("selected");b.addEventListener("click",async()=>{b.disabled=true;const r=await authenticatedRequest("/api/v1/users/me/profile/avatar/predefined",{method:"PUT",body:JSON.stringify({avatarKey:a.key})});b.disabled=false;if(r.response.ok){if(currentProfile){currentProfile.avatarKey=a.key;appState.profile=currentProfile;}setUserAvatar(a.key);document.querySelectorAll(".avatar-option").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");setMessage("profile-status","Avatar atualizado.",true);}else setMessage("profile-status",errorMessage(r.response.status));});grid.append(b);}}
let currentProfile=null;
const goalLabels={GENERAL:"Geral",CONVERSATION:"Conversação",WORK:"Trabalho",TRAVEL:"Viagem",STUDY:"Estudos"};
const resolveImageUrl=url=>url?(url.startsWith("http")?url:`${BACKEND_URL}${url}`):"";
function createAvatarElement({imageUrl,alt="Avatar",className="avatar-image",fallbackText=""}={}){const fallback=()=>Object.assign(document.createElement("span"),{className:`avatar-fallback ${className}`,textContent:fallbackText,title:"Imagem indisponível"});if(!imageUrl)return fallback();const img=document.createElement("img");img.className=className;img.alt=alt;img.src=resolveImageUrl(imageUrl);img.addEventListener("error",()=>img.replaceWith(fallback()),{once:true});return img;}
function setAvatarTarget(slotId,url,alt,type="user"){const slot=$(slotId);if(!slot)return;slot.replaceChildren(createAvatarElement({imageUrl:url,alt,className:type==="assistant"?"assistant-avatar":"user-avatar",fallbackText:""}));}
function setUserAvatar(key){const avatar=avatarCatalog.find(x=>x.key===key);const url=avatar?.imageUrl;setAvatarTarget("profile-avatar-slot",url,"Avatar atual","user");setAvatarTarget("header-avatar-slot",url,"Avatar do usuário","user");setAvatarTarget("account-avatar-slot",url,"Avatar do usuário","user");}
function setAssistantAvatar(meta){const url=meta?.assistantAvatarImageUrl||meta?.imageUrl;setAvatarTarget("chat-assistant-avatar-slot",url,`Avatar de ${meta?.assistantDisplayName||"assistant"}`,"assistant");const box=$("chat-assistant");if(box)box.hidden=!meta;const name=$("chat-assistant-name"),description=$("chat-assistant-description");if(name)name.textContent=meta?.assistantDisplayName||"";if(description)description.textContent=meta?.description||"";}
function renderProfileSummary(d){$("profile-summary-name").textContent=d?.preferredName||"Não informado";$("profile-summary-age").textContent=d?.age??"Não informado";$("profile-summary-level").textContent=d?.englishLevel||"Não informado";$("profile-summary-goal").textContent=goalLabels[d?.learningGoal]||"Não informado";$("profile-onboarding").textContent=d?.onboardingCompleted?"Concluído.":"Complete seu perfil para personalizar as conversas.";setUserAvatar(d?.avatarKey||"avatar_default");$("profile-edit-button").textContent=d?.onboardingCompleted?"Editar perfil":"Completar perfil";}
async function loadGlobalProfile(){const [p,a]=await Promise.all([authenticatedRequest("/api/v1/users/me/profile"),authenticatedRequest("/api/v1/avatars")]);if(!p.response.ok)throw Error("profile request failed");appState.profile=p.body||{};currentProfile=appState.profile;avatarCatalog=a.response.ok&&Array.isArray(a.body)?a.body:[];appState.avatars=avatarCatalog;renderProfileSummary(currentProfile);renderAvatars();return appState.profile;}
async function loadProfileArea(){setMessage("profile-status","Carregando perfil...");$("profile-summary").hidden=false;$("profile-edit-panel").hidden=true;try{if(!appState.profile)await loadGlobalProfile();else{currentProfile=appState.profile;avatarCatalog=appState.avatars;renderProfileSummary(currentProfile);renderAvatars();}setMessage("profile-status");}catch(_){setMessage("profile-status","Não foi possível carregar o perfil.");}}
function openProfileEdit(){const d=currentProfile||{};$("profile-name").value=d.preferredName||"";$("profile-age").value=d.age??"";$("profile-level").value=d.englishLevel||"";$("profile-goal").value=d.learningGoal||"";$("profile-summary").hidden=true;$("profile-edit-panel").hidden=false;renderAvatars();$("profile-name").focus();}
function closeProfileEdit(){ $("profile-edit-panel").hidden=true;$("profile-summary").hidden=false; }
async function saveProfile(e){e.preventDefault();setMessage("profile-status","Salvando perfil...");const body={preferredName:$('profile-name').value||null,age:$('profile-age').value?Number($('profile-age').value):null,englishLevel:$('profile-level').value||null,learningGoal:$('profile-goal').value||null};const r=await authenticatedRequest("/api/v1/users/me/profile",{method:"PUT",body:JSON.stringify(body)});if(r.response.ok){currentProfile=r.body||body;appState.profile=currentProfile;renderProfileSummary(currentProfile);setUserAvatar(currentProfile.avatarKey||"avatar_default");closeProfileEdit();setMessage("profile-status","Perfil salvo.",true);}else setMessage("profile-status",r.response.status===401?"Sua sessão expirou.":errorMessage(r.response.status));}
async function loadScenarios(){
  const version = conversationLoadVersion;
  setMessage("scenario-status","Carregando cenários...");
  const r=await authenticatedRequest("/api/v1/conversation-scenarios");
  if(version !== conversationLoadVersion || !appState.currentUser)return;
  if(!r.response.ok)return setMessage("scenario-status",errorMessage(r.response.status));
  scenarioCatalog=Array.isArray(r.body)?r.body:[];
  const list=$("scenario-list"); list.replaceChildren();
  if(!scenarioCatalog.length){const empty=document.createElement("p");empty.textContent="Nenhum cenário disponível no momento.";list.append(empty);return;}
  for(const sc of scenarioCatalog){
    const card=document.createElement("article"); card.className="catalog-card scenario-card card";
    const avatarUrl=sc.assistantAvatarImageUrl||sc.imageUrl;
    card.append(createAvatarElement({imageUrl:avatarUrl,alt:`Avatar de ${sc.assistantDisplayName||"assistant"}`,className:"scenario-avatar",fallbackText:""}));
    const h=document.createElement("h3");h.textContent=sc.displayName||"Cenário";
    const assistant=document.createElement("p");assistant.className="scenario-assistant-name";assistant.textContent=sc.assistantDisplayName||"";
    const description=document.createElement("p");description.textContent=sc.description||"";
    const b=document.createElement("button");b.className="primary";b.textContent="Iniciar conversa";b.addEventListener("click",()=>createConversation(sc.id,b));
    card.append(h,assistant,description,b);list.append(card);
  }
  setMessage("scenario-status");
}
async function createConversation(scenario, button) {
  if (pendingConversationCreation) return;
  if (!appState.currentUser || appState.currentView !== "scenarios" || !scenarioCatalog.some(item => item.id === scenario)) {
    return setMessage("scenario-status", "Escolha um cenário disponível.");
  }
  const operation = { version: conversationLoadVersion, userId: appState.currentUser.id };
  pendingConversationCreation = operation;
  if (button) { button.disabled = true; setButtonBusy(button, true); }
  const isCurrent = () => operation.version === conversationLoadVersion && operation.userId === appState.currentUser?.id;
  setMessage("scenario-status", "Criando conversa e preparando a primeira mensagem...");
  try {
    const r = await authenticatedRequest("/api/v1/conversations", { method: "POST",
      body: JSON.stringify({ scenario, language: $("chat-language").value }) });
    if (!isCurrent()) return;
    if (!r.response.ok) {
      if (r.response.status === 401) return showLogin("Sua sessão expirou. Entre novamente.");
      return setMessage("scenario-status", errorMessage(r.response.status));
    }
    if (!validConversation(r.body) || r.body.scenario !== scenario) {
      return setMessage("scenario-status", "O servidor retornou uma conversa inválida. Consulte Conversas antes de tentar novamente.");
    }
    await openConversation(r.body.id, scenario);
  } catch (_) {
    if (isCurrent()) setMessage("scenario-status", "Não foi possível concluir a abertura. Consulte Conversas antes de tentar novamente.");
  } finally {
    if (pendingConversationCreation === operation) pendingConversationCreation = null;
    if (button) { button.disabled = false; setButtonBusy(button, false); }
  }
}

function formatConversationDate(value) { if (!value) return ""; const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date); }
async function loadConversations(){
  const version=conversationLoadVersion;
  setMessage("conversation-status","Carregando conversas...");
  try {
    const r=await authenticatedRequest("/api/v1/conversations");
    if(version!==conversationLoadVersion || !appState.currentUser)return;
    if(!r.response.ok){setMessage("conversation-status",errorMessage(r.response.status));return;}
    const list=$("conversation-list");list.replaceChildren();
    if(!Array.isArray(r.body)||!r.body.length){const empty=document.createElement("p");empty.textContent="Nenhuma conversa ainda. Escolha um cenário para começar.";list.append(empty);setMessage("conversation-status");return;}
    for(const c of r.body){const card=document.createElement("article");card.className="catalog-card conversation-card card";const avatarUrl=c.assistantAvatarImageUrl;card.append(createAvatarElement({imageUrl:avatarUrl,alt:`Avatar de ${c.assistantDisplayName||""}`,className:"conversation-avatar"}));const h=document.createElement("h3");h.textContent=c.scenarioDisplayName||c.title||"Conversa";const assistant=document.createElement("p");assistant.className="scenario-assistant-name";assistant.textContent=c.assistantDisplayName||"";const meta=document.createElement("small");const date=formatConversationDate(c.updatedAt);meta.textContent=date?`Atualizada em ${date}`:"";const actions=document.createElement("div");const open=document.createElement("button");open.className="secondary";open.textContent="Abrir";open.onclick=()=>openConversation(c.id);const del=document.createElement("button");del.className="button-danger";del.textContent="Excluir";del.onclick=()=>deleteConversation(c.id);actions.append(open,del);card.append(h,assistant,meta,actions);list.append(card);}
    setMessage("conversation-status");
  } catch (_) {
    if(version===conversationLoadVersion && appState.currentUser)setMessage("conversation-status","Não foi possível carregar as conversas.");
  } finally {
    if(version===conversationLoadVersion && appState.currentUser && appState.currentView === "conversations" && $("conversation-status").textContent === "Carregando conversas...") setMessage("conversation-status","Não foi possível carregar as conversas.");
  }
}
async function openConversation(id, expectedScenario) {
  clearCurrentConversation();
  const version = conversationLoadVersion, userId = appState.currentUser?.id;
  if (!userId) return showLogin();
  const isCurrent = () => version === conversationLoadVersion && userId === appState.currentUser?.id;
  try {
    const r = await authenticatedRequest(`/api/v1/conversations/${encodeURIComponent(id)}`);
    if (!isCurrent()) return;
    if (r.response.status === 401) return showLogin("Sua sessão expirou. Entre novamente.");
    const detail = r.body, conversation = detail?.conversation;
    if (!r.response.ok || !validConversation(conversation) || conversation.id !== id
        || (expectedScenario && conversation.scenario !== expectedScenario)
        || !Array.isArray(detail.messages) || !detail.messages.every(message =>
          ["USER", "ASSISTANT"].includes(message.role) && typeof message.content === "string")) {
      await showView("conversations");
      return setMessage("conversation-status", "Não foi possível abrir essa conversa. Escolha uma conversa válida ou um cenário.");
    }
    // Only a complete, ownership-checked Backend detail can become the active conversation.
    appState.currentConversation = conversation;
    $("chat-language").value = conversation.language;
    $("chat-language").disabled = true;
    setAssistantAvatar(conversation);
    for (const message of detail.messages) {
      const item = appendChatMessage(message.role.toLowerCase(), message.content);
      if (message.correctedText) {
        const correction = document.createElement("div");
        correction.className = "chat-correction";
        correction.textContent = message.correctedText;
        item.item.append(correction);
      }
    }
    showView("chat");
  } catch (_) {
    if (isCurrent()) {
      await showView("conversations");
      setMessage("conversation-status", "Não foi possível carregar a conversa. Tente abri-la novamente.");
    }
  }
}

async function deleteConversation(id){if(!window.confirm("Excluir esta conversa?"))return;const r=await authenticatedRequest(`/api/v1/conversations/${id}`,{method:"DELETE"});if(!r.response.ok)return setMessage("conversation-status",errorMessage(r.response.status));if(appState.currentConversation?.id===id)showView("conversations");loadConversations();}
try { $("profile-form").addEventListener("submit",saveProfile); } catch (_) {}
try { $("profile-edit-button").addEventListener("click",openProfileEdit); $("profile-cancel-button").addEventListener("click",closeProfileEdit); } catch (_) {}
document.querySelectorAll('[data-view="profile"]').forEach(b=>b.addEventListener("click",loadProfileArea));

const googleScript = document.createElement("script"); googleScript.src = "https://accounts.google.com/gsi/client"; googleScript.async = true; googleScript.onload = prepareGoogle; document.head.appendChild(googleScript); setVoiceState("idle"); showHome();
