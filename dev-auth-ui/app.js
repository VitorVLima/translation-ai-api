// Development-only UI. Tokens remain only in sessionStorage.
const BACKEND_URL = "http://localhost:8080";
const GOOGLE_CLIENT_ID = "491728559092-frggmogjfh3mmh0kkduuk11053lucfp3.apps.googleusercontent.com";
const ACCESS_KEY = "englishai_access_token", REFRESH_KEY = "englishai_refresh_token";

let chatHistory = [];
let scenarioCatalog = [], avatarCatalog = [];
let conversationLoadVersion = 0, pendingConversationCreation = null;
let conversationCompletion = null;
let progressRequest = null, progressVersion = 0, progressPeriod = "ALL_TIME";
const appState = { currentUser: null, profile: null, avatars: avatarCatalog, currentConversation: null, conversationCount: null, currentView: null, conversationNavigationContext: null, sidebarCollapsed: globalThis.localStorage?.getItem("englishai_sidebar_collapsed") === "true" };
const $ = id => document.getElementById(id);
const LOADING_DELAY_MS = 200;
const loadingOperations = new Map();
const loginView = $("login-view"), appView = $("app-view");
const tokens = () => ({ accessToken: sessionStorage.getItem(ACCESS_KEY), refreshToken: sessionStorage.getItem(REFRESH_KEY) });
const saveTokens = data => { if (data?.accessToken && data?.refreshToken) { sessionStorage.setItem(ACCESS_KEY, data.accessToken); sessionStorage.setItem(REFRESH_KEY, data.refreshToken); } };
const clearSession = () => { sessionStorage.removeItem(ACCESS_KEY); sessionStorage.removeItem(REFRESH_KEY); };
const setMessage = (id, text = "", success = false) => {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle("success", success);
  el.classList.toggle("info", !success && ["Transcrevendo..."].includes(text));
  if (id === "progress-status" && text) loadingOperations.get("progress-loading")?.finish();
};
function setButtonBusy(button, busy) {
  button.setAttribute("aria-busy", String(busy));
  button.classList.toggle("is-loading", busy);
}
function startLoading(id) {
  const element = $(id);
  if (!element) return () => {};
  loadingOperations.get(id)?.finish();
  const operation = { timer: null, finish: null };
  operation.finish = () => {
    if (loadingOperations.get(id) !== operation) return;
    clearTimeout(operation.timer);
    loadingOperations.delete(id);
    element.hidden = true;
    element.setAttribute("aria-busy", "false");
  };
  loadingOperations.set(id, operation);
  element.hidden = true;
  element.setAttribute("aria-busy", "true");
  operation.timer = setTimeout(() => {
    if (loadingOperations.get(id) === operation) element.hidden = false;
  }, LOADING_DELAY_MS);
  return operation.finish;
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
function resetProgress() {
  loadingOperations.get("progress-loading")?.finish();
  progressVersion++; progressRequest?.abort(); progressRequest = null; progressPeriod = "ALL_TIME";
  document.querySelectorAll?.(".progress-period").forEach(button => button.classList.toggle("active", button.dataset.period === progressPeriod));
  ["progress-conversations", "progress-readings", "progress-new-words", "progress-mastered", "progress-conversation-count", "progress-conversation-success", "progress-conversation-rate", "progress-conversation-average", "progress-communication", "progress-grammar", "progress-vocabulary", "progress-fluency", "progress-reading-count", "progress-reading-success", "progress-reading-rate", "progress-reading-average", "progress-word-count", "progress-word-new", "progress-word-learning", "progress-word-reviewing", "progress-word-mastered", "progress-word-due", "progress-vocabulary-period"].forEach(id => { const element = $(id); if (element) element.textContent = ""; });
  ["progress-conversation-difficulty", "progress-reading-difficulty", "progress-timeline"].forEach(id => $(id)?.replaceChildren());
  const content = $("progress-content"); if (content) content.hidden = true;
  setMessage("progress-status");
}
function showLogin(message = "", clear = true) { resetReading(); resetVocabulary(); resetProgress(); clearCurrentConversation(); appState.currentUser = null; appState.profile = null; appState.conversationCount = null; scenarioCatalog = []; if (clear) clearSession(); loginView.hidden = false; appView.hidden = true; $("skip-link").setAttribute("href", "#login-form"); setMessage("message", message); }
function validConversation(conversation) {
  return conversation && typeof conversation.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversation.id)
    && typeof conversation.scenario === "string" && /^[A-Z][A-Z0-9_]{2,63}$/.test(conversation.scenario)
    && typeof conversation.assistantDisplayName === "string" && conversation.assistantDisplayName.trim()
    && typeof conversation.assistantAvatarKey === "string" && conversation.assistantAvatarKey.trim()
    && typeof conversation.assistantAvatarImageUrl === "string" && conversation.assistantAvatarImageUrl.trim()
    && ["en", "pt"].includes(conversation.language);
}
function clearCurrentConversation() {
  conversationCompletion?.controller.abort();
  conversationCompletion = null;
  $("conversation-evaluation").hidden = true;
  $("conversation-evaluation").classList.remove("is-collapsed");
  $("conversation-evaluation").replaceChildren();
  setMessage("conversation-completion-status");
  conversationLoadVersion++;
  cancelConversation();
  appState.currentConversation = null;
  chatHistory = [];
  $("chat-messages").replaceChildren();
  $("chat-message").value = "";
  $("chat-form").hidden = false;
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
function progressElement(id) {
  const element = $(id);
  if (!element) throw new Error(`[Progress] missing DOM element #${id}`);
  return element;
}
function showView(name) {
  if (appState.currentView === "reading" && name !== "reading") returnToReadingSetup();
  if (appState.currentView === "progress" && name !== "progress") resetProgress();
  if (name === "chat" && (!appState.currentUser || !validConversation(appState.currentConversation))) name = "scenarios";
  if (name !== "chat") clearCurrentConversation();
  appState.currentView = name;
  if (name === "reading") prepareReading();
  if (name === "vocabulary") loadVocabulary().catch(() => { loadingOperations.get("vocabulary-loading")?.finish(); setMessage("vocabulary-status", "Não foi possível carregar o vocabulário."); });
  if (name === "progress") loadProgress().catch(error => { console.error("[Progress] load failed", error); setMessage("progress-status", "Não foi possível carregar seu progresso."); });
  document.querySelectorAll(".page-view").forEach(v => v.hidden = v.id !== `view-${name}`);
  const activeView = name === "chat" ? appState.conversationNavigationContext === "history" ? "conversations" : "scenarios" : name;
  document.querySelectorAll("[data-view]").forEach(b => {
    b.classList.toggle("active", b.dataset.view === activeView);
    b.setAttribute("aria-current", b.dataset.view === activeView ? "page" : "false");
  });
  if (name === "scenarios" && appState.currentUser) return loadScenarios().catch(() => { loadingOperations.get("scenario-loading")?.finish(); setMessage("scenario-status", "Não foi possível carregar os cenários."); });
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
async function showHome() { const state=await loadCurrentUser(); if(state.kind!=="user"){if(state.kind==="none")showLogin();else if(state.kind==="expired")showLogin("Sua sessão expirou. Entre novamente.");else showLogin("Não foi possível conectar ao servidor.",false);return;} const user=state.user; clearCurrentConversation(); appState.conversationNavigationContext=null; if(appState.currentUser?.id!==user.id){resetVocabulary();resetProgress();} appState.currentUser=user; try{await loadGlobalProfile();}catch(_){setMessage("profile-status","Não foi possível carregar o perfil.");} loginView.hidden=true;appView.hidden=false;$("skip-link").setAttribute("href","#main-content");["username","header-username","account-name"].forEach(id=>{const el=$(id);if(el)el.textContent=user.username||"";});["account-email"].forEach(id=>{const el=$(id);if(el)el.textContent=user.email||"";});const verified=user.emailVerified===true?"Sim":user.emailVerified===false?"Não":"Não informado";const verifiedEl=$("account-verified");if(verifiedEl)verifiedEl.textContent=verified;showView("home");}

async function runAi({ buttonId, statusId, path, body, onSuccess, loading }) {
  const button = $(buttonId), start = performance.now(); button.disabled = true; setButtonBusy(button, true); button.textContent = loading; setMessage(statusId);
  try { const result = await authenticatedRequest(path, { method: "POST", body: JSON.stringify(body) }); if (result.response.ok) { onSuccess(result.body); setMessage(statusId, elapsed(start), true); return result; } if (result.networkError) setMessage(statusId, "Não foi possível conectar ao servidor."); else if (result.sessionInvalid || result.response.status === 401) showLogin("Sua sessão expirou. Entre novamente."); else setMessage(statusId, errorMessage(result.response.status)); return result; }
  catch (_) { setMessage(statusId, "Não foi possível conectar ao servidor."); return null; } finally { button.disabled = false; setButtonBusy(button, false); button.textContent = buttonId === "translate" ? "Traduzir" : "Corrigir"; }
}
function renderExamples(containerId, examples) { const box = $(containerId); box.replaceChildren(); for (const example of Array.isArray(examples) ? examples.slice(0, 3) : []) { const item = document.createElement("div"); item.className = "learning-example"; const text = document.createElement("strong"); text.textContent = example.text || ""; const translation = document.createElement("span"); translation.textContent = example.translation || ""; item.append(text, translation); box.append(item); } }
function renderTranslationEnrichment(enrichment) { const box = $("translation-enrichment"), usage = enrichment?.usage?.trim?.() || ""; renderExamples("translation-examples", enrichment?.examples); $("translation-usage").textContent = usage; box.hidden = !usage && !$("translation-examples").children.length; }
function renderCorrectionLearning(data) { const state = data?.status === "CORRECT_WITH_SUGGESTIONS" ? "✓ Sua frase está correta" : data?.status === "CORRECT" ? "✓ Sua frase está correta" : "Correção"; $("correction-state").textContent = state; const alternatives = $("correction-alternatives"); alternatives.replaceChildren(); for (const value of Array.isArray(data?.alternatives) ? data.alternatives.slice(0, 3) : []) { const p = document.createElement("p"); p.className = "correction-alternative"; p.textContent = value; alternatives.append(p); } $("correction-explanation").textContent = data?.explanation || ""; $("correction-tip").textContent = data?.usageTip || ""; $("correction-tip-heading").hidden = !data?.usageTip; $("correction-explanation").hidden = !data?.explanation; renderExamples("correction-examples", data?.examples); const learning = $("correction-learning"); learning.hidden = !data?.explanation && !data?.usageTip && !alternatives.children.length && !$("correction-examples").children.length; }
async function translate() { const text = $("translation-text").value, sourceLanguage = $("source-language").value, targetLanguage = $("target-language").value; $("translation-result").value = ""; $("speak-translation").disabled = true; renderTranslationEnrichment(null); if (!text.trim()) return setMessage("translation-status", "Digite um texto para traduzir."); if (sourceLanguage === targetLanguage) return setMessage("translation-status", "Escolha idiomas diferentes."); if (text.length > 5000) return setMessage("translation-status", "O texto deve ter no máximo 5000 caracteres."); await runAi({ buttonId: "translate", statusId: "translation-status", path: "/api/v1/translate", body: { text, sourceLanguage, targetLanguage }, loading: "Traduzindo...", onSuccess: data => { $("translation-result").value = data?.translation || ""; $("speak-translation").disabled = !$("translation-result").value.trim(); renderTranslationEnrichment(data?.enrichment); } }); }
async function correct() { const text = $("correction-text").value; $("corrected-result").value = ""; $("speak-correction").disabled = true; $("correction-learning").hidden = true; if (!text.trim()) return setMessage("correction-status", "Digite uma frase em inglês para corrigir."); if (text.length > 5000) return setMessage("correction-status", "O texto deve ter no máximo 5000 caracteres."); await runAi({ buttonId: "correct", statusId: "correction-status", path: "/api/v1/correct", body: { text, language: "en" }, loading: "Corrigindo...", onSuccess: data => { $("corrected-result").value = data?.correctedText || ""; $("speak-correction").disabled = !$("corrected-result").value.trim(); renderCorrectionLearning(data); if (data?.status === "CORRECT" || data?.status === "CORRECT_WITH_SUGGESTIONS") setMessage("correction-status", "O texto já está correto.", true); } }); }

async function prepareGoogle() { if (!window.google?.accounts?.id || GOOGLE_CLIENT_ID.startsWith("COLOQUE")) return setMessage("message", "Configure GOOGLE_CLIENT_ID no app.js."); try { const nonceResult = await request("/api/v1/auth/google/nonce", { method: "POST" }); if (!nonceResult.response.ok || !nonceResult.body?.nonce) throw new Error(); const nonce = nonceResult.body.nonce; google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, nonce, callback: async credential => { try { const result = await request("/api/v1/auth/google", { method: "POST", body: JSON.stringify({ credential: credential.credential, nonce }) }); if (!result.response.ok) { setMessage("message", "Não foi possível entrar com Google."); return prepareGoogle(); } saveTokens(result.body); await showHome(); } catch (_) { setMessage("message", "Não foi possível conectar ao servidor."); } } }); $("google-button").replaceChildren(); google.accounts.id.renderButton($("google-button"), { theme: "outline", size: "large", width: 280 }); } catch (_) { setMessage("message", "Não foi possível conectar ao servidor."); } }
async function logout() { clearCurrentConversation(); const refreshToken = tokens().refreshToken; try { if (refreshToken) await request("/api/v1/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }); } finally { showLogin(); } }

document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => { if (button.dataset.view === "scenarios") appState.conversationNavigationContext = "new"; if (button.dataset.view === "conversations") appState.conversationNavigationContext = "history"; showView(button.dataset.view); }));
$("sidebar-toggle")?.addEventListener("click", () => { appState.sidebarCollapsed = !appState.sidebarCollapsed; globalThis.localStorage?.setItem("englishai_sidebar_collapsed", String(appState.sidebarCollapsed)); applySidebarState(); });
$("profile-header-link").addEventListener("click", () => { showView("profile"); loadProfileArea(); });
applySidebarState();
$("login-form").addEventListener("submit", loginLocal); $("chat-form").addEventListener("submit", sendChatStream); $("chat-message").addEventListener("input", () => $("chat-count").textContent = $("chat-message").value.length); $("chat-message").addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); $("chat-form").requestSubmit(); } }); $("logout").addEventListener("click", logout); $("account-logout").addEventListener("click", logout); $("translate").addEventListener("click", translate); $("correct").addEventListener("click", correct);
$("translation-text").addEventListener("input", () => $("translation-count").textContent = $("translation-text").value.length); $("record-chat").addEventListener("click", toggleRecording); $("record-translation").addEventListener("click", () => toggleRecording(toolRecordingConfig("translation"))); $("record-correction").addEventListener("click", () => toggleRecording(toolRecordingConfig("correction"))); $("speak-translation").addEventListener("click", () => playSpeech($("speak-translation"), $("translation-speech-status"), $("translation-result").value, $("target-language").value, false, undefined, false)); $("speak-correction").addEventListener("click", () => playSpeech($("speak-correction"), $("correction-speech-status"), $("corrected-result").value, "en", false, undefined, false)); $("correction-text").addEventListener("input", () => $("correction-count").textContent = $("correction-text").value.length); $("swap-languages").addEventListener("click", () => { const a = $("source-language"), b = $("target-language"), value = a.value; a.value = b.value; b.value = value; });
function appendChatMessage(role,text,pending=false){document.querySelectorAll(".chat-welcome").forEach(el => el.remove());const item=document.createElement("article");item.className="chat-message "+role;const label=document.createElement("strong");label.textContent=role==="user"?"Você":appState.currentConversation?.assistantDisplayName||"";const bubble=document.createElement("p");bubble.className="chat-bubble";bubble.hidden=false;bubble.textContent=text;if(pending)bubble.classList.add("pending");item.append(label,bubble);if(role==="assistant"&&text.trim())item.speechAction=appendAssistantActions(item,text,appState.currentConversation?.language);$("chat-messages").append(item);$("chat-messages").scrollTo({top:$('chat-messages').scrollHeight,behavior:chatScrollBehavior()});return {item,bubble};}

// Only the current request/player owns an audio URL; rendered history does not retain audio state.
let currentSpeech = null;
function setSpeechState(button, state) {
  button.disabled = state === "loading";
  button.setAttribute("data-state", state);
  const compact = button.dataset.speechCompact === "true";
  button.textContent = compact ? (state === "loading" ? "…" : state === "playing" ? "■" : "🔊")
    : state === "loading" ? "Gerando áudio..." : state === "playing" ? "Parar" : "Ouvir";
  button.title = state === "playing" ? "Parar áudio" : state === "loading" ? "Gerando áudio..." : button.dataset.speechLabel || "Ouvir resposta";
  button.setAttribute("aria-label", button.title);
  button.setAttribute("aria-busy", String(state === "loading"));
}

const progressDifficultyLabels = { BEGINNER: "Iniciante", INTERMEDIATE: "Intermediário", ADVANCED: "Avançado" };
const progressValue = value => value == null ? "—" : `${Math.round(value)}%`;
function renderProgressBreakdown(container, rows, reading = false) {
  container.replaceChildren();
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = document.createElement("div"), name = document.createElement("strong"), count = document.createElement("span"), average = document.createElement("span");
    item.className = "progress-breakdown-item"; name.textContent = progressDifficultyLabels[row.difficulty] || row.difficulty;
    count.textContent = `${row.count} ${row.count === 1 ? "atividade" : "atividades"}`;
    average.textContent = progressValue(reading ? row.averageComprehension : row.averageOverall);
    item.append(name, count, average); container.append(item);
  }
}
function renderProgress(data) {
  data = data && typeof data === "object" ? data : {};
  const overview = data.overview && typeof data.overview === "object" ? data.overview : {};
  const c = data.conversation && typeof data.conversation === "object" ? data.conversation : {};
  const r = data.reading && typeof data.reading === "object" ? data.reading : {};
  const v = data.vocabulary && typeof data.vocabulary === "object" ? data.vocabulary : {};
  const set=(id,value)=>progressElement(id).textContent=String(value ?? "");
  set("progress-conversations", overview.conversationsCompleted); set("progress-readings", overview.readingsCompleted);
  set("progress-new-words", overview.wordsFirstSeen); set("progress-mastered", overview.wordsMasteredCurrent);
  set("progress-conversation-count", c.totalEvaluated); set("progress-conversation-success", c.successCount); set("progress-conversation-rate", progressValue(c.successRate)); set("progress-conversation-average", progressValue(c.averageOverall));
  set("progress-communication", progressValue(c.averageCommunication)); set("progress-grammar", progressValue(c.averageGrammar)); set("progress-vocabulary", progressValue(c.averageVocabulary)); set("progress-fluency", progressValue(c.averageFluency));
  set("progress-reading-count", r.totalCompleted); set("progress-reading-success", r.successCount); set("progress-reading-rate", progressValue(r.successRate)); set("progress-reading-average", progressValue(r.averageComprehension));
  set("progress-word-count", v.totalWords); set("progress-word-new", v.newCount); set("progress-word-learning", v.learningCount); set("progress-word-reviewing", v.reviewingCount); set("progress-word-mastered", v.masteredCount); set("progress-word-due", v.dueForReview);
  progressElement("progress-vocabulary-period").textContent = data.period === "ALL_TIME" ? "Estado atual do seu vocabulário." : `${v.wordsFirstSeenInPeriod} encontradas e ${v.wordsReviewedInPeriod} com revisão mais recente no período.`;
  renderProgressBreakdown(progressElement("progress-conversation-difficulty"), c.byDifficulty); renderProgressBreakdown(progressElement("progress-reading-difficulty"), r.byDifficulty, true);
  const timeline=progressElement("progress-timeline"); timeline.replaceChildren();
  const timelinePayload=data.timeline;
  const points=Array.isArray(timelinePayload) ? timelinePayload : Array.isArray(timelinePayload?.points) ? timelinePayload.points : Array.isArray(timelinePayload?.timeline) ? timelinePayload.timeline : [];
  for(const point of points) { const conversation=point?.conversation||{}, reading=point?.reading||{}, vocabulary=point?.vocabulary||{}; const row=document.createElement("div"); row.className="progress-timeline-row"; const month=document.createElement("strong");month.textContent=point?.period||"—"; const conv=document.createElement("span");conv.textContent=`Conversação: ${progressValue(conversation.average)} (${conversation.count ?? 0})`; const read=document.createElement("span");read.textContent=`Leitura: ${progressValue(reading.average)} (${reading.count ?? 0})`; const words=document.createElement("span");words.textContent=`${vocabulary.wordsFirstSeen ?? 0} palavras novas`; row.append(month,conv,read,words); timeline.append(row); }
  progressElement("progress-content").hidden=false;
}
async function loadProgress() {
  const owner=appState.currentUser?.id; if(!owner) return;
  const period=progressPeriod;
  progressRequest?.abort(); const controller=new AbortController(), version=++progressVersion; progressRequest=controller;
  const current=()=>progressRequest===controller && version===progressVersion && appState.currentUser?.id===owner && appState.currentView==="progress";
  progressElement("progress-status"); const content=progressElement("progress-content"); const finishLoading=startLoading("progress-loading"); setMessage("progress-status"); content.hidden=true;
  let main, timeline;
  try { [main,timeline]=await Promise.all([authenticatedRequest(`/api/v1/progress?period=${period}`,{signal:controller.signal}),authenticatedRequest("/api/v1/progress/timeline",{signal:controller.signal})]); }
  catch(error){ if(current()&&error?.name!=="AbortError"){console.error("[Progress] request failed", error);setMessage("progress-status","Não foi possível carregar seu progresso. Tente novamente.");} return; }
  if(!current()){ finishLoading(); return; }
  if(main.response.status===401||timeline.response.status===401) return showLogin("Sua sessão expirou. Entre novamente.");
  if(!main.response.ok||!timeline.response.ok) { finishLoading(); return setMessage("progress-status",errorMessage(main.response.status)); }
  try {
    renderProgress({...main.body,timeline:timeline.body});
    finishLoading();
    setMessage("progress-status");
  } catch(error) { if(current()){ console.error("[Progress] render failed", error); setMessage("progress-status","Não foi possível carregar seu progresso. Tente novamente."); } }
  finally { finishLoading(); if(progressRequest===controller)progressRequest=null; }
}
document.querySelectorAll?.(".progress-period").forEach(button=>button.addEventListener("click",()=>{progressPeriod=button.dataset.period || "ALL_TIME";document.querySelectorAll(".progress-period").forEach(other=>other.classList.toggle("active",other===button));loadProgress();}));
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
async function playSpeech(button, output, text, language, automatic = false, pipelineStarted, voice = isVoiceMode(), conversationId, onReady, allowDuringChat = false) {
  if (recordingOperation || (activeChat && !allowDuringChat)) return false;
  if (currentSpeech?.button === button) {
    if (button.disabled) return;
    stopSpeech();
    return;
  }
  stopSpeech();
  output.textContent = "";
  output.hidden = true;
  const speech = { button, controller: new AbortController(), audio: null, url: null,
    voice, generation: conversationGeneration, start: performance.now() };
  currentSpeech = speech;
  setSpeechState(button, "loading");
  if (speech.voice) setVoiceState("generating_speech");
  updateConversationControls();
  const fail = message => {
    if (currentSpeech !== speech) return false;
    stopSpeech();
    output.textContent = automatic ? "Não foi possível reproduzir a resposta em áudio. " + message : message;
    output.hidden = false;
    return false;
  };
  let result;
  try {
    result = await authenticatedRequest("/api/v1/speech", {
      method: "POST", body: JSON.stringify({ text, language, ...(conversationId ? { conversationId } : {}) }),
      responseType: "blob", signal: speech.controller.signal
    });
  } catch (_) { return fail("Não foi possível conectar ao servidor."); }
  // A superseded request must never create a URL or start playback.
  if (currentSpeech !== speech) return false;
  if (result.networkError) return fail("Não foi possível conectar ao servidor.");
  if (result.sessionInvalid || result.response.status === 401) {
    stopSpeech();
    showLogin("Sua sessão expirou. Entre novamente.");
    return false;
  }
  if (!result.response.ok) {
    const messages = {
      400: "Não foi possível gerar áudio para esse texto.",
      429: "Muitas solicitações. Tente novamente em instantes.",
      503: "O serviço de voz está temporariamente indisponível."
    };
    return fail(messages[result.response.status] || "Não foi possível gerar áudio para esse texto.");
  }
  if (output.parentElement) addChatMetric(output.parentElement, "TTS", speech.start);
  try {
    speech.url = URL.createObjectURL(result.body);
    speech.audio = new Audio(speech.url);
    speech.audio.onended = () => { if (currentSpeech === speech) stopSpeech(); };
    speech.audio.onerror = () => fail("Não foi possível reproduzir o áudio.");
    if (currentSpeech !== speech) return false;
    onReady?.();
    await speech.audio.play();
    if (currentSpeech === speech) {
      if (automatic && Number.isFinite(pipelineStarted)) addChatMetric(output.parentElement, "Pipeline total", pipelineStarted);
      setSpeechState(button, "playing");
      if (speech.voice) setVoiceState("playing");
      updateConversationControls();
    }
    return true;
  } catch (_) { return fail("Não foi possível reproduzir o áudio."); }
}
function appendSpeechAction(actions, item, reply, language) {
  const conversationId = appState.currentConversation?.id;
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
  button.addEventListener("click", () => playSpeech(button, output, reply, language, false, undefined, isVoiceMode(), conversationId));
  actions.append(button);
  item.append(output);
  return { play: (automatic, pipelineStarted, onReady) => playSpeech(button, output, reply, language, automatic, pipelineStarted, isVoiceMode(), conversationId, onReady, true) };
}
function appendAssistantActions(item, reply, language) {
  if (typeof reply !== "string" || !reply.trim() || !["en", "pt"].includes(language) || item.classList.contains("error")) return;
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
  const speechAction = appendSpeechAction(actions, item, reply, language);
  item.append(actions, translated);
  item.chatActions = actions;
  return speechAction;
}



let conversationGeneration = 0, activeChat = null, recordingOperation = null;
let voiceState = "idle";
let recorder = null, recorderStream = null, recordingState = "idle";
function toolRecordingConfig(tool) { return tool === "translation"
  ? { kind: "translation", buttonId: "record-translation", inputId: "translation-text", statusId: "translation-stt-status", language: $("source-language").value }
  : { kind: "correction", buttonId: "record-correction", inputId: "correction-text", statusId: "correction-stt-status", language: "en" }; }
function chatRecordingConfig() { return { kind: "chat", buttonId: "record-chat", inputId: "chat-message", statusId: "chat-status", language: $("chat-language").value, voice: isVoiceMode(), generation: conversationGeneration }; }
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
  const closed = !!appState.currentConversation?.endedAt, evaluating = conversationCompletion !== null;
  $("delete-conversation").hidden = closed || !appState.currentConversation;
  $("chat-form").hidden = closed;
  const recordingBusy = recordingOperation !== null;
  const voiceBusy = isVoiceMode() && (recordingBusy || activeChat !== null || currentSpeech !== null);
  $("send-chat").disabled = activeChat !== null || (isVoiceMode() && (recordingBusy || currentSpeech !== null));
  $("chat-message").disabled = voiceBusy;
  $("chat-language").disabled = !!appState.currentConversation || recordingBusy || activeChat !== null || voiceBusy;
  const button = $("record-chat"), chatRecording = recordingOperation?.kind === "chat";
  button.disabled = recordingBusy && !chatRecording || recordingState === "acquiring" && chatRecording || recordingState === "processing" && chatRecording || activeChat !== null ||
    (isVoiceMode() && voiceState === "generating_speech");
  button.textContent = chatRecording && recordingState === "recording" ? "Gravando..." : chatRecording && recordingState === "processing" ? "Transcrevendo..." : chatRecording && recordingState === "acquiring" ? "Abrindo microfone..." : isVoiceMode() ? "Falar" : "Microfone";
  button.title = chatRecording && recordingState === "recording" ? "Parar gravação" : "Gravar mensagem";
  button.setAttribute("aria-label", button.title);
  button.classList.toggle("recording", recordingState === "recording");
  button.setAttribute("data-state", recordingState);
  button.setAttribute("aria-busy", String(recordingState === "acquiring" || recordingState === "processing"));
  document.querySelectorAll(".speech-action").forEach(action => {
    action.disabled = recordingBusy || activeChat !== null ||
      (currentSpeech?.button === action && action.getAttribute("aria-busy") === "true");
  });
  updateToolRecordingControls();
  if (closed || evaluating) {
    $("send-chat").disabled = true;
    $("chat-message").disabled = true;
    $("record-chat").disabled = true;
  }
  $("complete-conversation").disabled = !appState.currentConversation || closed || evaluating || activeChat !== null || recordingBusy || voiceState === "generating_speech";
  $("complete-conversation").textContent = evaluating ? "Avaliando sua conversa..." : closed ? "Conversa concluída" : "Encerrar conversa";
  $("complete-conversation").setAttribute("aria-busy", String(evaluating));
  document.querySelectorAll("[data-chat-mode]").forEach(button => button.disabled = evaluating || closed);
}
function renderConversationEvaluation(evaluation) {
  const area = $("conversation-evaluation");
  area.replaceChildren();
  area.hidden = !evaluation;
  if (!evaluation) return;
  area.classList.remove("is-collapsed");
  const title = document.createElement("h2"); title.textContent = "Resultado da conversa";
  const toggle = document.createElement("button"); toggle.type = "button"; toggle.className = "secondary small-action conversation-evaluation-toggle";
  toggle.textContent = "Recolher"; toggle.setAttribute("aria-expanded", "true"); toggle.setAttribute("aria-controls", "conversation-evaluation");
  const summary = document.createElement("p");
  summary.textContent = evaluation.status === "SUCCESS" ? "Boa comunicação! Continue praticando seu inglês." : "Continue praticando. Esta conversa mostrou pontos que você pode desenvolver.";
  const overall = document.createElement("h3"); overall.textContent = `Desempenho geral: ${evaluation.scores.overall}/100`;
  const scores = document.createElement("dl"); scores.className = "conversation-evaluation-scores";
  for (const [key, label] of [["communication", "Comunicação"], ["grammar", "Gramática"], ["vocabulary", "Vocabulário"], ["fluency", "Fluência linguística"], ["relevance", "Relevância"]]) {
    const term = document.createElement("dt"), value = document.createElement("dd");
    term.textContent = label; value.textContent = evaluation.scores[key] == null ? "—" : String(evaluation.scores[key]); scores.append(term, value);
  }
  title.hidden = false; title.append(toggle); area.append(title, summary, overall, scores);
  for (const [key, label] of [["strengths", "Pontos fortes"], ["improvements", "Para melhorar"]]) {
    const heading = document.createElement("h3"), list = document.createElement("ul"); heading.textContent = label;
    for (const text of evaluation[key]) { const item = document.createElement("li"); item.textContent = text; list.append(item); }
    area.append(heading, list);
  }
  const back = document.createElement("button"); back.type = "button"; back.className = "secondary"; back.textContent = "Voltar às conversas";
  back.onclick = () => showView("conversations"); area.append(back);
  const details = Array.from(area.children).slice(1);
  details.forEach(element => element.hidden = false);
  toggle.onclick = () => {
    area.classList.toggle("is-collapsed");
    const collapsed = area.classList.contains("is-collapsed");
    details.forEach(element => element.hidden = collapsed);
    toggle.textContent = collapsed ? "Expandir" : "Recolher";
    toggle.setAttribute("aria-expanded", String(!collapsed));
  };
}
function validConversationEvaluation(value, id) {
  return value?.conversationId === id && ["SUCCESS", "NEEDS_PRACTICE"].includes(value.status)
    && typeof value.evaluatedAt === "string" && ["communication", "grammar", "vocabulary", "fluency", "overall"].every(key => Number.isInteger(value.scores?.[key]) && value.scores[key] >= 0 && value.scores[key] <= 100)
    && (value.scores.relevance == null || Number.isInteger(value.scores.relevance) && value.scores.relevance >= 0 && value.scores.relevance <= 100)
    && ["strengths", "improvements"].every(key => Array.isArray(value[key]) && value[key].length <= 3 && value[key].every(text => typeof text === "string" && text.length <= 500));
}
async function completeConversation() {
  const conversation = appState.currentConversation;
  if (!conversation || conversation.endedAt || conversationCompletion || activeChat || recordingOperation || voiceState === "generating_speech") return;
  const operation = { controller: new AbortController(), conversation, userId: appState.currentUser?.id };
  const isCurrent = () => conversationCompletion === operation && appState.currentConversation === conversation && appState.currentUser?.id === operation.userId;
  conversationCompletion = operation;
  stopSpeech(); updateConversationControls();
  setMessage("conversation-completion-status", "Avaliando sua conversa...");
  try {
    const r = await authenticatedRequest(`/api/v1/conversations/${encodeURIComponent(conversation.id)}/complete`, { method: "POST", signal: operation.controller.signal });
    if (!isCurrent()) return;
    if (r.response.status === 401) return showLogin("Sua sessão expirou. Entre novamente.");
    if (!r.response.ok) return setMessage("conversation-completion-status", errorMessage(r.response.status) + " Você pode tentar novamente.");
    if (r.body?.status === "INSUFFICIENT" && r.body.conversationId === conversation.id) {
      return setMessage("conversation-completion-status", `Converse um pouco mais antes de encerrar para avaliarmos seu desempenho. Participação: ${r.body.currentUserMessages} de ${r.body.minimumUserMessages} mensagens necessárias.`);
    }
    if (!validConversationEvaluation(r.body, conversation.id)) throw new Error("Invalid evaluation");
    conversation.endedAt = r.body.evaluatedAt;
    renderConversationEvaluation(r.body);
    setMessage("conversation-completion-status", "Avaliação salva. Você pode consultar o resultado no histórico.", true);
  } catch (error) {
    if (isCurrent() && error.name !== "AbortError") setMessage("conversation-completion-status", "Não foi possível avaliar a conversa. Tente novamente; seu histórico foi preservado.");
  } finally {
    if (isCurrent()) { conversationCompletion = null; updateConversationControls(); }
  }
}
$("complete-conversation").addEventListener("click", completeConversation);
function updateToolRecordingControls() { for (const tool of ["translation", "correction"]) { const config=toolRecordingConfig(tool), button=$(config.buttonId), active=recordingOperation?.buttonId===config.buttonId; button.disabled=!!recordingOperation&&!active; button.textContent=active&&recordingState==="recording"?"Parar gravação":active&&recordingState==="processing"?"Transcrevendo...":active&&recordingState==="acquiring"?"Abrindo microfone...":"Microfone"; button.title=active&&recordingState==="recording"?"Parar gravação":`Gravar texto para ${tool==="translation"?"traduzir":"corrigir"}`; button.setAttribute("aria-label",button.title); button.classList.toggle("recording",active&&recordingState==="recording"); button.setAttribute("aria-busy",String(active&&(recordingState==="acquiring"||recordingState==="processing"))); } }
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
function setRecordingState(state, message = "", operation = recordingOperation) {
  recordingState = state;
  if (operation?.voice && state === "recording") setVoiceState("recording");
  if (operation?.voice && state === "processing") setVoiceState("transcribing");
  updateConversationControls();
  if (message) setMessage(operation?.statusId || "chat-status", message);
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
    setRecordingState("idle", "Não foi possível processar o áudio enviado.", operation);
    if (operation.voice) setVoiceState("idle");
    return;
  }
  setRecordingState("processing", "Transcrevendo...", operation);
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
      if (result.networkError) setMessage(operation.statusId, "Não foi possível conectar ao servidor.");
      else if (result.sessionInvalid || result.response.status === 401) showLogin("Sua sessão expirou. Entre novamente.");
      else setMessage(operation.statusId, messages[result.response.status] || "Não foi possível processar o áudio enviado.");
      return;
    }
    const text = result.body?.text;
    if (typeof text !== "string" || !text.trim()) {
      setMessage(operation.statusId, "Não foi possível identificar fala no áudio.");
      return;
    }
    const sttSeconds = (performance.now() - start) / 1000;
    recordingOperation = null;
    setRecordingState("idle", "", operation);
    if (operation.voice) {
      await sendChatMessage(text, operation.language, { voice: true, generation: operation.generation, sttSeconds, pipelineStarted: operation.processingStarted });
    } else {
      const input = $(operation.inputId), separator = operation.kind === "chat" && input.value && !/\s$/.test(input.value) ? " " : "";
      input.value = operation.kind === "chat" ? input.value + separator + text : text;
      input.dispatchEvent(new Event("input"));
      setMessage(operation.statusId, `Áudio transcrito. Revise o texto antes de continuar. STT: ${sttSeconds.toFixed(1)} s`, true);
    }
  } catch (_) {
    if (recordingOperation === operation) setMessage(operation.statusId, "Não foi possível conectar ao servidor.");
  } finally {
    if (recordingOperation === operation) {
      recordingOperation = null;
      setRecordingState("idle", "", operation);
      if (operation.voice) setVoiceState("idle");
    }
  }
}
async function toggleRecording(config = chatRecordingConfig()) {
  if (config.kind === "chat" && (appState.currentConversation?.endedAt || conversationCompletion)) return;
  if ($("record-chat").disabled && config.kind === "chat" || $(config.buttonId).disabled) return;
  if (recordingState === "recording") {
    recordingOperation.processingStarted = performance.now();
    setRecordingState("processing", "", recordingOperation);
    recorder.stop();
    return;
  }
  if (recordingOperation || activeChat) return;
  stopSpeech();
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    return setRecordingState("idle", "Gravação de áudio não é suportada neste navegador.", config);
  }
  const operation = { ...config, controller: new AbortController(), generation: config.generation ?? conversationGeneration,
    voice: config.voice === true };
  recordingOperation = operation;
  setRecordingState("acquiring", "", operation);
  setMessage(operation.statusId);
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
      setRecordingState("idle", "Não foi possível acessar o microfone.", operation);
      if (operation.voice) setVoiceState("idle");
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
    setRecordingState("recording", "", operation);
  } catch (error) {
    if (recordingOperation !== operation) return;
    recordingOperation = null;
    releaseRecorder();
    setRecordingState("idle", error?.name === "NotAllowedError" ? "Permissão para usar o microfone foi negada." : "Não foi possível acessar o microfone.", operation);
    if (operation.voice) setVoiceState("idle");
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
    assistant.chatCorrection = box;
  }
  const speechAction = appendAssistantActions(assistant.item, reply, language);
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
  if (conversation.endedAt || conversationCompletion) return;
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
  if (options.voice) assistant.bubble.hidden = true;
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
        if (!options.voice) setChatResponding(assistant, false);
        chatHistory.push({ role: "user", content: message }, { role: "assistant", content: assistant.bubble.textContent });
        speechAction = renderCompletedReply(assistant, message, language, meta, start, firstToken, options);
        if (options.voice) {
          assistant.chatActions && (assistant.chatActions.hidden = true);
          assistant.chatCorrection && (assistant.chatCorrection.hidden = true);
        }
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
    if (!options.voice || !chat.complete) setChatResponding(assistant, false);
    // complete is terminal: cancel the reader instead of waiting for the connection to close.
    if (reader) {
      try { await reader.cancel(); } catch (_) {}
      reader.releaseLock();
    }
    if (isCurrent() && (!options.voice || !chat.complete)) {
      activeChat = null;
      if (options.voice) setVoiceState("idle");
      updateConversationControls();
    }
    $("chat-messages").scrollTo({ top: $("chat-messages").scrollHeight, behavior: chatScrollBehavior() });
  }
  if (chat.complete && options.voice && isVoiceMode() && options.generation === conversationGeneration) {
    const reveal = () => {
      if (!isCurrent()) return;
      assistant.bubble.hidden = false;
      if (assistant.chatActions) assistant.chatActions.hidden = false;
      if (assistant.chatCorrection) assistant.chatCorrection.hidden = false;
      setChatResponding(assistant, false);
      activeChat = null;
      updateConversationControls();
    };
    const played = await speechAction?.play(true, options.pipelineStarted, reveal);
    if (!played && isCurrent()) {
      reveal();
      setVoiceState("idle");
      updateConversationControls();
    }
  }
}

function renderAvatars(){const grid=$("avatar-grid");if(!grid)return;grid.replaceChildren();if(!avatarCatalog.length){const empty=document.createElement("p");empty.textContent="Nenhum avatar disponível no momento.";grid.append(empty);return;}const selectedKey=profileDraftAvatarKey??currentProfile?.avatarKey;for(const a of avatarCatalog){const b=document.createElement("button");b.type="button";b.className="avatar-option";b.title=a.displayName;b.dataset.key=a.key;b.setAttribute("aria-pressed",String(selectedKey===a.key));const img=createAvatarElement({imageUrl:a.imageUrl,alt:`Avatar ${a.displayName}`,className:"profile-option-avatar"});const label=document.createElement("span");label.textContent=a.displayName;b.append(img,label);if(selectedKey===a.key)b.classList.add("selected");b.addEventListener("click",()=>{profileDraftAvatarKey=a.key;renderAvatars();});grid.append(b);}}
let currentProfile=null, profileDraftAvatarKey=null;
const goalLabels={GENERAL:"Geral",CONVERSATION:"Conversação",WORK:"Trabalho",TRAVEL:"Viagem",STUDY:"Estudos"};
const englishLevelLabels={A1:"A1 — Iniciante",A2:"A2 — Básico",B1:"B1 — Intermediário",B2:"B2 — Intermediário superior",C1:"C1 — Avançado",C2:"C2 — Proficiente"};
const difficultyForEnglishLevel=level=>({A1:"BEGINNER",A2:"BEGINNER",B1:"INTERMEDIATE",B2:"INTERMEDIATE",C1:"ADVANCED",C2:"ADVANCED"}[level]||"INTERMEDIATE");
const resolveImageUrl=url=>url?(url.startsWith("http")?url:`${BACKEND_URL}${url}`):"";
function createAvatarElement({imageUrl,alt="Avatar",className="avatar-image",fallbackText=""}={}){const fallback=()=>Object.assign(document.createElement("span"),{className:`avatar-fallback ${className}`,textContent:fallbackText,title:"Imagem indisponível"});if(!imageUrl)return fallback();const img=document.createElement("img");img.className=className;img.alt=alt;img.src=resolveImageUrl(imageUrl);img.addEventListener("error",()=>img.replaceWith(fallback()),{once:true});return img;}
function setAvatarTarget(slotId,url,alt,type="user"){const slot=$(slotId);if(!slot)return;slot.replaceChildren(createAvatarElement({imageUrl:url,alt,className:type==="assistant"?"assistant-avatar":"user-avatar",fallbackText:""}));}
function setUserAvatar(key){const avatar=avatarCatalog.find(x=>x.key===key);const url=avatar?.imageUrl;setAvatarTarget("profile-avatar-slot",url,"Avatar atual","user");setAvatarTarget("header-avatar-slot",url,"Avatar do usuário","user");setAvatarTarget("account-avatar-slot",url,"Avatar do usuário","user");}
function setAssistantAvatar(meta){const url=meta?.assistantAvatarImageUrl||meta?.imageUrl;setAvatarTarget("chat-assistant-avatar-slot",url,`Avatar de ${meta?.assistantDisplayName||"assistant"}`,"assistant");const box=$("chat-assistant");if(box)box.hidden=!meta;const name=$("chat-assistant-name"),description=$("chat-assistant-description");if(name)name.textContent=meta?.assistantDisplayName||"";if(description)description.textContent=meta?.description||"";}
function renderProfileSummary(d){$("profile-summary-name").textContent=d?.preferredName||"Não informado";$("profile-summary-age").textContent=d?.age??"Não informado";$("profile-summary-level").textContent=englishLevelLabels[d?.englishLevel]||"Não informado";$("profile-summary-goal").textContent=goalLabels[d?.learningGoal]||"Não informado";$("profile-onboarding").textContent=d?.onboardingCompleted?"Concluído.":"Complete seu perfil para personalizar as conversas.";setUserAvatar(d?.avatarKey||"avatar_default");$("profile-edit-button").textContent=d?.onboardingCompleted?"Editar perfil":"Completar perfil";}
async function loadGlobalProfile(){const [p,a]=await Promise.all([authenticatedRequest("/api/v1/users/me/profile"),authenticatedRequest("/api/v1/avatars")]);if(!p.response.ok)throw Error("profile request failed");appState.profile=p.body||{};currentProfile=appState.profile;avatarCatalog=a.response.ok&&Array.isArray(a.body)?a.body:[];appState.avatars=avatarCatalog;renderProfileSummary(currentProfile);renderAvatars();return appState.profile;}
async function loadProfileArea(){const needsFetch=!appState.profile;const finishLoading=needsFetch?startLoading("profile-loading"):()=>{};setMessage("profile-status");$("profile-summary").hidden=needsFetch;$("profile-edit-panel").hidden=true;try{if(needsFetch)await loadGlobalProfile();else{currentProfile=appState.profile;avatarCatalog=appState.avatars;renderProfileSummary(currentProfile);renderAvatars();}$("profile-summary").hidden=false;setMessage("profile-status");}catch(_){setMessage("profile-status","Não foi possível carregar o perfil.");}finally{finishLoading();}}
function openProfileEdit(){const d=currentProfile||{};profileDraftAvatarKey=d.avatarKey||"avatar_default";$("profile-name").value=d.preferredName||"";$("profile-age").value=d.age??"";$("profile-level").value=d.englishLevel||"";$("profile-goal").value=d.learningGoal||"";$("profile-summary").hidden=true;$("profile-edit-panel").hidden=false;renderAvatars();$("profile-name").focus();}
function closeProfileEdit(){profileDraftAvatarKey=null;$("profile-edit-panel").hidden=true;$("profile-summary").hidden=false;renderAvatars();}
async function saveProfile(e){e.preventDefault();const saveButton=$("profile-save-button"),body={preferredName:$("profile-name").value||null,age:$("profile-age").value?Number($("profile-age").value):null,englishLevel:$("profile-level").value||null,learningGoal:$("profile-goal").value||null};saveButton.disabled=true;setButtonBusy(saveButton,true);setMessage("profile-status","Salvando perfil...");try{const profileResult=await authenticatedRequest("/api/v1/users/me/profile",{method:"PUT",body:JSON.stringify(body)});if(!profileResult.response.ok){setMessage("profile-status",profileResult.response.status===401?"Sua sessão expirou.":errorMessage(profileResult.response.status));return;}currentProfile=profileResult.body||{...currentProfile,...body};appState.profile=currentProfile;const avatarKey=profileDraftAvatarKey||currentProfile.avatarKey;if(avatarKey&&avatarKey!==currentProfile.avatarKey){const avatarResult=await authenticatedRequest("/api/v1/users/me/profile/avatar/predefined",{method:"PUT",body:JSON.stringify({avatarKey})});if(!avatarResult.response.ok){renderProfileSummary(currentProfile);setMessage("profile-status","Dados salvos, mas não foi possível atualizar o avatar. Tente salvar novamente.");return;}currentProfile=avatarResult.body||{...currentProfile,avatarKey};appState.profile=currentProfile;}renderProfileSummary(currentProfile);closeProfileEdit();setMessage("profile-status","Perfil salvo.",true);}catch(_){setMessage("profile-status","Não foi possível conectar ao servidor.");}finally{saveButton.disabled=false;setButtonBusy(saveButton,false);}}
const CONVERSATION_LIMIT = 3;
const conversationLimitMessage = "Você já possui 3 conversas ativas. Encerre ou exclua uma delas para iniciar outra.";
const activeConversationCount = conversations => Array.isArray(conversations) ? conversations.filter(conversation => !conversation.endedAt).length : null;
const conversationDifficulties = [
  { value: "BEGINNER", label: "Iniciante", cefr: "A1–A2", hint: "Conversas mais simples, com frases curtas, vocabulário comum e mais ajuda durante a prática.", features: ["Frases mais simples", "Vocabulário comum", "Mais ajuda"] },
  { value: "INTERMEDIATE", label: "Intermediário", cefr: "B1–B2", hint: "Conversas mais naturais, com vocabulário mais variado e um pouco mais de desafio.", features: ["Conversas naturais", "Vocabulário mais amplo", "Ajuda moderada"] },
  { value: "ADVANCED", label: "Avançado", cefr: "C1–C2", hint: "Conversas próximas do inglês real, com expressões, vocabulário avançado e estruturas mais complexas.", features: ["Inglês mais natural", "Expressões e phrasal verbs", "Menos simplificação"] }
];
const conversationDifficultyValues = new Set(conversationDifficulties.map(item => item.value));
const conversationDifficultyLabels = Object.fromEntries(conversationDifficulties.map(item => [item.value, item.label]));
function createDifficultyPicker(scenario) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "conversation-difficulty-picker";
  const legend = document.createElement("legend");
  legend.textContent = "Escolha a dificuldade";
  fieldset.append(legend);
  const recommended = difficultyForEnglishLevel(currentProfile?.englishLevel);
  const inputs = conversationDifficulties.map((difficulty, index) => {
    const label = document.createElement("label");
    label.className = "difficulty-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `difficulty-${scenario}`;
    input.value = difficulty.value;
    input.checked = difficulty.value === recommended;
    const content = document.createElement("span");
    const features = difficulty.features.map(feature => `<li>${feature}</li>`).join("");
    const badge = difficulty.value === recommended && currentProfile?.englishLevel ? "<b class=\"difficulty-recommended\">Recomendado para você</b>" : "";
    content.innerHTML = `<strong>${difficulty.label}</strong><small>${difficulty.cefr}</small><em>${difficulty.hint}</em><ul>${features}</ul>${badge}`;
    label.append(input, content);
    fieldset.append(label);
    return input;
  });
  return { fieldset, selected: () => inputs.find(input => input.checked)?.value || "INTERMEDIATE" };
}
const conversationModes = [
  { value: "text", label: "Texto", hint: "Converse escrevendo e leia as respostas da IA.", features: ["Digite suas mensagens", "Respostas em texto", "Ideal para praticar escrita e leitura"] },
  { value: "voice", label: "Voz", hint: "Converse falando e ouça as respostas da IA.", features: ["Use o microfone", "Respostas reproduzidas automaticamente", "Ideal para praticar fala e compreensão auditiva"] }
];
function createModePicker(scenario) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "conversation-mode-picker";
  const legend = document.createElement("legend");
  legend.textContent = "Como você quer conversar?";
  fieldset.append(legend);
  const inputs = conversationModes.map(mode => {
    const label = document.createElement("label");
    label.className = "mode-option";
    const input = document.createElement("input");
    input.type = "radio"; input.name = `conversation-mode-${scenario}`; input.value = mode.value; input.checked = mode.value === "text";
    const content = document.createElement("span");
    content.innerHTML = `<strong>${mode.label}</strong><em>${mode.hint}</em><ul>${mode.features.map(feature => `<li>${feature}</li>`).join("")}</ul>`;
    label.append(input, content); fieldset.append(label); return input;
  });
  return { fieldset, selected: () => inputs.find(input => input.checked)?.value || "text" };
}
function updateScenarioCapacity() {
  for (const card of $("scenario-list").children) {
    const button = [...card.children].find(child => child.className === "primary");
    if (button) button.disabled = appState.conversationCount == null || appState.conversationCount >= CONVERSATION_LIMIT || !!pendingConversationCreation;
  }
}
async function loadScenarios(){
  const version = conversationLoadVersion;
  const finishLoading = startLoading("scenario-loading");
  const list = $("scenario-list"); list.hidden = true;
  setMessage("scenario-status");
  appState.conversationCount = null;
  updateScenarioCapacity();
  const [r, owned] = await Promise.all([authenticatedRequest("/api/v1/conversation-scenarios"), authenticatedRequest("/api/v1/conversations")]);
  if(version !== conversationLoadVersion || !appState.currentUser){ finishLoading(); return; }
  if(!r.response.ok){ finishLoading(); return setMessage("scenario-status",errorMessage(r.response.status)); }
  appState.conversationCount = owned.response.ok ? activeConversationCount(owned.body) : null;
  scenarioCatalog=Array.isArray(r.body)?r.body:[];
  list.replaceChildren();
  if(!scenarioCatalog.length){const empty=document.createElement("p");empty.textContent="Nenhum cenário disponível no momento.";list.append(empty);list.hidden=false;finishLoading();return;}
  for(const sc of scenarioCatalog){
    const card=document.createElement("article"); card.className="catalog-card scenario-card card";
    const avatarUrl=sc.assistantAvatarImageUrl||sc.imageUrl;
    card.append(createAvatarElement({imageUrl:avatarUrl,alt:`Avatar de ${sc.assistantDisplayName||"assistant"}`,className:"scenario-avatar",fallbackText:""}));
    const h=document.createElement("h3");h.textContent=sc.displayName||"Cenário";
    const assistant=document.createElement("p");assistant.className="scenario-assistant-name";assistant.textContent=sc.assistantDisplayName||"";
    const description=document.createElement("p");description.textContent=sc.description||"";
    const difficultyPicker=createDifficultyPicker(sc.id), modePicker=createModePicker(sc.id);
    const b=document.createElement("button");b.className="primary";b.textContent="Iniciar conversa";b.addEventListener("click",()=>createConversation(sc.id,b,difficultyPicker.selected(),modePicker.selected()));
    card.append(h,assistant,description,difficultyPicker.fieldset,modePicker.fieldset,b);list.append(card);
  }
  list.hidden=false; updateScenarioCapacity();
  setMessage("scenario-status", appState.conversationCount == null ? "Não foi possível verificar suas conversas. Abra Cenários novamente para tentar." : appState.conversationCount >= CONVERSATION_LIMIT ? conversationLimitMessage : "");
  finishLoading();
}
async function createConversation(scenario, button, difficulty = "INTERMEDIATE", mode = "text") {
  if (pendingConversationCreation) return;
  if (!appState.currentUser || appState.currentView !== "scenarios" || !scenarioCatalog.some(item => item.id === scenario)) {
    return setMessage("scenario-status", "Escolha um cenário disponível.");
  }
  if (appState.conversationCount == null) return setMessage("scenario-status", "Aguarde a verificação das suas conversas.");
  if (appState.conversationCount >= CONVERSATION_LIMIT) return setMessage("scenario-status", conversationLimitMessage);
  difficulty = conversationDifficultyValues.has(difficulty) ? difficulty : "INTERMEDIATE";
  mode = mode === "voice" ? "voice" : "text";
  // Set the UI preference before POST so the persisted opening follows the selected voice flow.
  $("chat-mode").value = mode;
  const operation = { version: conversationLoadVersion, userId: appState.currentUser.id };
  pendingConversationCreation = operation;
  updateScenarioCapacity();
  if (button) { button.disabled = true; setButtonBusy(button, true); }
  const isCurrent = () => operation.version === conversationLoadVersion && operation.userId === appState.currentUser?.id;
  setMessage("scenario-status", "Criando conversa e preparando a primeira mensagem...");
  try {
    const r = await authenticatedRequest("/api/v1/conversations", { method: "POST",
      body: JSON.stringify({ scenario, language: $("chat-language").value, difficulty }) });
    if (!isCurrent()) return;
    if (!r.response.ok) {
      if (r.response.status === 401) return showLogin("Sua sessão expirou. Entre novamente.");
      if (r.response.status === 409) {
        appState.conversationCount = CONVERSATION_LIMIT;
        return setMessage("scenario-status", conversationLimitMessage);
      }
      return setMessage("scenario-status", errorMessage(r.response.status));
    }
    if (!validConversation(r.body) || r.body.scenario !== scenario) {
      return setMessage("scenario-status", "O servidor retornou uma conversa inválida. Consulte Conversas antes de tentar novamente.");
    }
    await openConversation(r.body.id, scenario, { playOpening: mode === "voice", navigationContext: "new" });
  } catch (_) {
    if (isCurrent()) setMessage("scenario-status", "Não foi possível concluir a abertura. Consulte Conversas antes de tentar novamente.");
  } finally {
    if (pendingConversationCreation === operation) pendingConversationCreation = null;
    if (button) setButtonBusy(button, false);
    updateScenarioCapacity();
  }
}

function formatConversationDate(value) { if (!value) return ""; const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date); }
async function loadConversations(){
  const version=conversationLoadVersion;
  const finishLoading = startLoading("conversation-loading");
  const list=$("conversation-list"); list.hidden=true;
  setMessage("conversation-status");
  try {
    const r=await authenticatedRequest("/api/v1/conversations");
    if(version!==conversationLoadVersion || !appState.currentUser)return;
    if(!r.response.ok){setMessage("conversation-status",errorMessage(r.response.status));return;}
    appState.conversationCount = activeConversationCount(r.body);
    list.replaceChildren();
    if(!Array.isArray(r.body)||!r.body.length){const empty=document.createElement("p");empty.textContent="Nenhuma conversa ainda. Escolha um cenário para começar.";list.append(empty);list.hidden=false;setMessage("conversation-status");return;}
    for(const c of r.body){const card=document.createElement("article");card.className=`catalog-card conversation-card card ${c.endedAt?"conversation-ended":"conversation-active"}`;const avatarUrl=c.assistantAvatarImageUrl;card.append(createAvatarElement({imageUrl:avatarUrl,alt:`Avatar de ${c.assistantDisplayName||""}`,className:"conversation-avatar"}));const h=document.createElement("h3");h.textContent=c.scenarioDisplayName||c.title||"Conversa";const assistant=document.createElement("p");assistant.className="scenario-assistant-name";assistant.textContent=c.assistantDisplayName||"";const state=document.createElement("small");state.className="conversation-state";state.textContent=c.endedAt?"✓ Encerrada":"● Ativa";const meta=document.createElement("small");const date=formatConversationDate(c.updatedAt), difficulty=conversationDifficultyLabels[c.difficulty]||conversationDifficultyLabels.INTERMEDIATE;meta.textContent=`${difficulty}${date?` · Atualizada em ${date}`:""}`;const actions=document.createElement("div");const open=document.createElement("button");open.className="secondary";open.textContent="Abrir";open.onclick=()=>{open.disabled=true;setButtonBusy(open,true);open.textContent="Carregando...";return openConversation(c.id, undefined, { navigationContext: "history" }).finally(()=>{open.disabled=false;setButtonBusy(open,false);open.textContent="Abrir";});};actions.append(open);if(!c.endedAt){const del=document.createElement("button");del.className="button-danger";del.textContent="Excluir";del.onclick=()=>deleteConversation(c.id);actions.append(del);}card.append(h,assistant,state,meta,actions);list.append(card);}
    list.hidden=false; setMessage("conversation-status");
  } catch (_) {
    if(version===conversationLoadVersion && appState.currentUser)setMessage("conversation-status","Não foi possível carregar as conversas.");
  } finally {
    finishLoading();
  }
}
async function openConversation(id, expectedScenario, options = {}) {
  appState.conversationNavigationContext = options.navigationContext || appState.conversationNavigationContext || (appState.currentView === "conversations" ? "history" : "new");
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
    let openingItem;
    for (const message of detail.messages) {
      const item = appendChatMessage(message.role.toLowerCase(), message.content);
      if (!openingItem && options.playOpening && message.role === "ASSISTANT") openingItem = item;
      if (message.correctedText) {
        const correction = document.createElement("div");
        correction.className = "chat-correction";
        correction.textContent = message.correctedText;
        item.item.append(correction);
      }
    }
    showView("chat");
    if (validConversationEvaluation(detail.evaluation, conversation.id)) renderConversationEvaluation(detail.evaluation);
    else if (conversation.endedAt) setMessage("conversation-completion-status", "Conversa concluída.");
    updateConversationControls();
    if (openingItem?.item.speechAction && isVoiceMode() && options.playOpening) {
      openingItem.bubble.hidden = true;
      if (openingItem.item.chatActions) openingItem.item.chatActions.hidden = true;
      setChatResponding(openingItem, true);
      const reveal = () => {
        if (!isCurrent()) return;
        openingItem.bubble.hidden = false;
        if (openingItem.item.chatActions) openingItem.item.chatActions.hidden = false;
        setChatResponding(openingItem, false);
        setVoiceState("idle");
        updateConversationControls();
      };
      const played = await openingItem.item.speechAction.play(true, undefined, reveal);
      if (!played && isCurrent()) reveal();
    }
  } catch (_) {
    if (isCurrent()) {
      await showView("conversations");
      setMessage("conversation-status", "Não foi possível carregar a conversa. Tente abri-la novamente.");
    }
  }
}

async function deleteConversation(id, options = {}) { if (!window.confirm("Excluir esta conversa? Todas as mensagens desta conversa serão removidas permanentemente.")) return; const r = await authenticatedRequest(`/api/v1/conversations/${encodeURIComponent(id)}`, { method: "DELETE" }); const statusId = options.statusId || "conversation-status"; if (!r.response.ok) return setMessage(statusId, errorMessage(r.response.status)); if (appState.currentConversation?.id === id) { if (options.navigateToNew) { appState.conversationNavigationContext = "new"; clearCurrentConversation(); await showView("scenarios"); } else showView("conversations"); } await loadConversations(); if (appState.currentView === "scenarios") await loadScenarios(); }
try { $("profile-form").addEventListener("submit",saveProfile); } catch (_) {}
try { $("profile-edit-button").addEventListener("click",openProfileEdit); $("profile-cancel-button").addEventListener("click",closeProfileEdit); } catch (_) {}
document.querySelectorAll('[data-view="profile"]').forEach(b=>b.addEventListener("click",loadProfileArea));
$("delete-conversation").addEventListener("click", () => deleteConversation(appState.currentConversation?.id, { navigateToNew: true, statusId: "conversation-completion-status" }));

// Reading is session-only. The generated difficulty belongs to the displayed text,
// even if the user changes the next exercise's controls before asking for hints.
const readingTopicLabels = { DAILY_LIFE: "Cotidiano", TRAVEL: "Viagem", WORK: "Trabalho", TECHNOLOGY: "Tecnologia", CULTURE: "Cultura", RANDOM: "Aleatório" };
const validUuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const readingState = { picker: null, current: null, generation: null, hint: null, hintConsumed: false, questions: null, questionGeneration: null, submission: null, answers: new Map(), score: 0 };
function prepareReading() {
  if (!readingState.picker) {
    readingState.picker = createDifficultyPicker("reading");
    $("reading-difficulty").replaceChildren(readingState.picker.fieldset);
  }
}
function updateReadingControls() {
  const generating = !!readingState.generation, hinting = !!readingState.hint, generatingQuestions = !!readingState.questionGeneration;
  $("reading-generate").disabled = generating;
  $("reading-generate").textContent = generating ? "Gerando texto..." : "Gerar texto";
  $("reading-generate").setAttribute("aria-busy", String(generating));
  $("reading-hint").disabled = generating || hinting || readingState.hintConsumed || !readingState.current;
  $("reading-hint").textContent = hinting ? "Preparando dica..." : readingState.hintConsumed ? "✓ Dica consultada" : "Dica";
  $("reading-hint").setAttribute("aria-busy", String(hinting));
  $("reading-speak").disabled = generating || !readingState.current || currentSpeech?.button === $("reading-speak") && !currentSpeech.audio;
  $("reading-questions-action").disabled = generating || generatingQuestions || !!readingState.questions || !readingState.current;
  $("reading-questions-action").textContent = generatingQuestions ? "Preparando questões..." : readingState.questions ? "✓ Questões preparadas" : "Testar compreensão";
  $("reading-questions-action").setAttribute("aria-busy", String(generatingQuestions));
}
function cancelReadingRequests() {
  readingState.generation?.abort(); readingState.hint?.abort(); readingState.questionGeneration?.abort();
  readingState.generation = null; readingState.hint = null; readingState.questionGeneration = null; readingState.submission = null;
  if (currentSpeech?.button === $("reading-speak")) stopSpeech();
  setMessage("reading-status"); setMessage("reading-hint-status"); setMessage("reading-questions-status");
  updateReadingControls();
}
function clearReadingContent() {
  readingState.current = null;
  readingState.hintConsumed = false; readingState.questions = null; readingState.answers = new Map(); readingState.score = 0;
  $("reading-text").textContent = "";
  $("reading-level").textContent = "";
  $("reading-topic-label").textContent = "";
  $("reading-hint-items").replaceChildren();
  $("reading-hints").hidden = true;
  $("reading-question-items").replaceChildren(); $("reading-questions").hidden = true; $("reading-score").textContent = ""; setMessage("reading-questions-status");
  $("reading-result").hidden = true;
  $("reading-setup").hidden = false;
}
function returnToReadingSetup() {
  cancelReadingRequests();
  clearReadingContent();
  updateReadingControls();
}
function resetReading() {
  returnToReadingSetup();
  readingState.picker = null;
  $("reading-difficulty").replaceChildren(); $("reading-topic").value = "DAILY_LIFE";
  updateReadingControls();
}
async function generateReading() {
  if (readingState.generation || appState.currentView !== "reading") return;
  prepareReading(); stopSpeech();
  readingState.hint?.abort(); readingState.hint = null;
  readingState.questionGeneration?.abort(); readingState.questionGeneration = null; readingState.questions = null; readingState.answers = new Map(); readingState.score = 0;
  $("reading-hints").hidden = true; $("reading-hint-items").replaceChildren();
  $("reading-questions").hidden = true; $("reading-question-items").replaceChildren(); $("reading-score").textContent = "";
  setMessage("reading-hint-status"); setMessage("reading-speech-status"); setMessage("reading-questions-status");
  const controller = new AbortController(); readingState.generation = controller;
  const difficulty = readingState.picker.selected(), topic = $("reading-topic").value;
  updateReadingControls(); setMessage("reading-status", "Gerando texto...");
  try {
    const result = await authenticatedRequest("/api/v1/reading/generate", { method: "POST", signal: controller.signal, body: JSON.stringify({ difficulty, topic }) });
    if (readingState.generation !== controller) return;
    if (result.sessionInvalid || result.response.status === 401) return showLogin("Sua sessão expirou. Entre novamente.");
    if (!result.response.ok) return setMessage("reading-status", errorMessage(result.response.status));
    const data = result.body;
    if (typeof data?.text !== "string" || !data.text.trim() || data.text.length > 5000 || data.text.trim().split(/\s+/u).length > 300 || data.difficulty !== difficulty || data.topic !== topic) {
      return setMessage("reading-status", "Não foi possível preparar um texto válido. Tente novamente.");
    }
    readingState.current = data;
    readingState.hintConsumed = false;
    $("reading-text").textContent = data.text;
    $("reading-level").textContent = conversationDifficultyLabels[data.difficulty];
    $("reading-topic-label").textContent = readingTopicLabels[data.topic] || data.topic;
    $("reading-setup").hidden = true;
    $("reading-result").hidden = false;
    setMessage("reading-status");
  } catch (_) {
    if (readingState.generation === controller) setMessage("reading-status", "Não foi possível gerar o texto. Tente novamente.");
  } finally {
    if (readingState.generation === controller) { readingState.generation = null; updateReadingControls(); }
  }
}
async function requestReadingHint() {
  if (!readingState.current || readingState.hint || readingState.hintConsumed || readingState.generation || appState.currentView !== "reading") return;
  const controller = new AbortController(), reading = readingState.current;
  readingState.hint = controller; updateReadingControls(); setMessage("reading-hint-status", "Preparando dica...");
  try {
    const result = await authenticatedRequest("/api/v1/reading/hint", { method: "POST", signal: controller.signal, body: JSON.stringify({ text: reading.text, difficulty: reading.difficulty }) });
    if (readingState.hint !== controller || readingState.current !== reading) return;
    if (result.sessionInvalid || result.response.status === 401) return showLogin("Sua sessão expirou. Entre novamente.");
    if (!result.response.ok) return setMessage("reading-hint-status", errorMessage(result.response.status));
    const box = $("reading-hint-items"); box.replaceChildren();
    for (const item of Array.isArray(result.body?.items) ? result.body.items.slice(0, 5) : []) {
      if (typeof item.expression !== "string" || !item.expression.trim() || typeof item.explanation !== "string" || !item.explanation.trim()) continue;
      const card = document.createElement("div"), expression = document.createElement("strong"), explanation = document.createElement("p");
      card.className = "learning-example"; expression.lang = "en";
      expression.textContent = item.expression; explanation.textContent = item.explanation;
      card.append(expression, explanation); box.append(card);
    }
    $("reading-hints").hidden = !box.children.length;
    if (box.children.length) readingState.hintConsumed = true;
    setMessage("reading-hint-status", box.children.length ? "" : "Não foi possível preparar dicas úteis. Você pode tentar novamente.");
  } catch (_) {
    if (readingState.hint === controller) setMessage("reading-hint-status", "Não foi possível preparar a dica. Tente novamente.");
  } finally {
    if (readingState.hint === controller) { readingState.hint = null; updateReadingControls(); }
  }
}
function renderReadingQuestions(questions) {
  const box = $("reading-question-items"); box.replaceChildren(); readingState.answers = new Map(); readingState.score = 0;
  questions.forEach((question, index) => {
    const card = document.createElement("article"); card.className = "reading-question";
    const title = document.createElement("h4"); title.textContent = `${index + 1}. ${question.question}`; card.append(title);
    const options = document.createElement("div"); options.className = "reading-question-options";
    question.options.forEach((option, optionIndex) => {
      const label = document.createElement("label"); label.className = "reading-answer-option";
      const input = document.createElement("input"); input.type = "radio"; input.name = `reading-question-${index}`; input.value = String(optionIndex);
      const text = document.createElement("span"); text.className = "reading-answer-text"; text.textContent = option; label.append(input, text); options.append(label);
    });
    const confirm = document.createElement("button"); confirm.className = "secondary small-action"; confirm.type = "button"; confirm.textContent = "Responder";
    const result = document.createElement("div"); result.className = "reading-question-result"; result.hidden = true;
    confirm.addEventListener("click", () => {
      if (readingState.answers.has(index)) return;
      const selected = [...options.children].find(label => label.children[0].checked);
      if (!selected) return;
      const answer = Number(selected.children[0].value), correct = answer === question.correctOption;
      readingState.answers.set(index, answer); if (correct) readingState.score++;
      [...options.children].forEach(label => { label.children[0].disabled = true; if (Number(label.children[0].value) === question.correctOption) label.classList.add("correct"); if (Number(label.children[0].value) === answer && !correct) label.classList.add("incorrect"); });
      confirm.disabled = true; confirm.textContent = "Respondida"; result.hidden = false; result.replaceChildren();
      const status = document.createElement("strong"); status.textContent = correct ? "✓ Correto" : "✗ Incorreto"; result.append(status);
      if (!correct) { const answerText = document.createElement("p"); answerText.textContent = `Resposta correta: ${question.options[question.correctOption]}`; result.append(answerText); }
      const explanation = document.createElement("p"); explanation.textContent = question.explanation; result.append(explanation);
      if (readingState.answers.size === questions.length) {
        $("reading-score").textContent = `Resultado: ${readingState.score} de ${questions.length}`;
        submitReadingActivity();
      }
    });
    card.append(options, confirm, result); box.append(card);
  });
  $("reading-questions").hidden = false;
}
async function submitReadingActivity() {
  const reading = readingState.current;
  if (!reading?.activityId || readingState.submission || readingState.answers.size !== 3) return;
  const controller = new AbortController(); readingState.submission = controller;
  try {
    const answers = [...readingState.answers.entries()].map(([index, selectedOption]) => ({ questionId: readingState.questions[index].id, selectedOption }));
    const result = await authenticatedRequest(`/api/v1/reading/${reading.activityId}/submit`, { method: "POST", signal: controller.signal, body: JSON.stringify({ answers }) });
    if (readingState.submission !== controller || readingState.current !== reading) return;
    if (result.sessionInvalid || result.response.status === 401) return showLogin("Sua sessão expirou. Entre novamente.");
    if (!result.response.ok) return setMessage("reading-questions-status", errorMessage(result.response.status));
    const data = result.body;
    if (Number.isInteger(data?.correctAnswers) && Number.isInteger(data?.totalQuestions)) {
      $("reading-score").textContent = `Resultado: ${data.correctAnswers} de ${data.totalQuestions} (${data.percentage}% de compreensão)`;
    }
  } catch (_) {
    if (readingState.submission === controller) setMessage("reading-questions-status", "Não foi possível salvar o resultado. Tente novamente.");
  } finally { if (readingState.submission === controller) readingState.submission = null; }
}
async function requestReadingQuestions() {
  if (!readingState.current || readingState.questions || readingState.questionGeneration || readingState.generation || appState.currentView !== "reading") return;
  const controller = new AbortController(), reading = readingState.current; readingState.questionGeneration = controller; updateReadingControls(); setMessage("reading-questions-status", "Preparando questões...");
  try {
    const body = reading.activityId ? { activityId: reading.activityId } : { text: reading.text, difficulty: reading.difficulty };
    const result = await authenticatedRequest("/api/v1/reading/questions", { method: "POST", signal: controller.signal, body: JSON.stringify(body) });
    if (readingState.questionGeneration !== controller || readingState.current !== reading) return;
    if (result.sessionInvalid || result.response.status === 401) return showLogin("Sua sessão expirou. Entre novamente.");
    if (!result.response.ok || !Array.isArray(result.body?.questions) || result.body.questions.length !== 3
      || result.body.questions.some(question => !question || (reading.activityId && !validUuid(question.id)) || !["MAIN_IDEA", "DETAIL", "VOCABULARY"].includes(question.type) || typeof question.question !== "string" || !question.question.trim() || !Array.isArray(question.options) || question.options.length !== 4 || question.options.some(option => typeof option !== "string" || !option.trim()) || !Number.isInteger(question.correctOption) || question.correctOption < 0 || question.correctOption > 3 || typeof question.explanation !== "string" || !question.explanation.trim())) {
      $("reading-questions").hidden = false;
      return setMessage("reading-questions-status", "Não foi possível preparar as questões. Tente novamente.");
    }
    readingState.questions = result.body.questions; renderReadingQuestions(readingState.questions); setMessage("reading-questions-status");
  } catch (_) {
    if (readingState.questionGeneration === controller) { $("reading-questions").hidden = false; setMessage("reading-questions-status", "Não foi possível preparar as questões. Tente novamente."); }
  } finally {
    if (readingState.questionGeneration === controller) { readingState.questionGeneration = null; updateReadingControls(); }
  }
}
$("reading-generate").addEventListener("click", generateReading);
$("reading-hint").addEventListener("click", requestReadingHint);
$("reading-back").addEventListener("click", returnToReadingSetup);
$("reading-questions-action").addEventListener("click", requestReadingQuestions);
$("reading-speak").addEventListener("click", async () => {
  if (!readingState.current || readingState.generation || appState.currentView !== "reading") return;
  const playing = playSpeech($("reading-speak"), $("reading-speech-status"), readingState.current.text, "en", false, undefined, false);
  if (currentSpeech?.button === $("reading-speak") && !currentSpeech.audio) $("reading-speak").textContent = "Preparando áudio...";
  await playing;
});
window.addEventListener("pagehide", cancelReadingRequests);

const vocabularyCategoryLabels = { HOUSE: "Casa", WORK: "Trabalho", TRANSPORT: "Transporte", FOOD: "Comida", CLOTHES: "Roupas", BODY: "Corpo", FAMILY: "Família", COUNTRIES: "Países", NATIONALITIES: "Nacionalidades", COLORS: "Cores", NUMBERS: "Números", COMMON_ADJECTIVES: "Adjetivos comuns", COMMON_VERBS: "Verbos comuns", TECHNOLOGY: "Tecnologia", TRAVEL: "Viagem", RESTAURANT: "Restaurante", SCHOOL: "Escola", SHOPPING: "Compras", HEALTH: "Saúde", LEISURE: "Lazer" };
const vocabularyProgressLabels = { NEW: "Nova", LEARNING: "Aprendendo", REVIEWING: "Revisando", MASTERED: "Dominada" };
const VOCABULARY_ITEMS_PER_LESSON = 10;
const VOCABULARY_QUIZ_QUESTION_COUNT = 5;
const VOCABULARY_EXERCISE_TOTAL = VOCABULARY_QUIZ_QUESTION_COUNT + 1;
const vocabularyState = {
  lesson: null, currentWordIndex: 0, furthestWordIndex: 0, wordsStudied: false,
  quizWords: [], quizIndex: 0, quizAnswers: new Map(), quizScore: 0,
  questionAnswered: false, quizSubmitting: false, evaluating: false,
  ownerId: null, version: 0, loadController: null, quizController: null, evaluationController: null
};

function resetVocabulary() {
  loadingOperations.get("vocabulary-loading")?.finish();
  vocabularyState.version++;
  vocabularyState.loadController?.abort();
  vocabularyState.quizController?.abort();
  vocabularyState.evaluationController?.abort();
  vocabularyState.loadController = null;
  vocabularyState.quizController = null;
  vocabularyState.evaluationController = null;
  if (currentSpeech?.button === $("vocabulary-word-audio") || currentSpeech?.button === $("vocabulary-example-audio")) stopSpeech();
  vocabularyState.lesson = null;
  vocabularyState.ownerId = null;
  vocabularyState.currentWordIndex = 0;
  vocabularyState.furthestWordIndex = 0;
  vocabularyState.wordsStudied = false;
  vocabularyState.quizWords = [];
  vocabularyState.quizIndex = 0;
  vocabularyState.quizAnswers = new Map();
  vocabularyState.quizScore = 0;
  vocabularyState.questionAnswered = false;
  vocabularyState.quizSubmitting = false;
  vocabularyState.evaluating = false;
  if ($("vocabulary-quiz-items")) $("vocabulary-quiz-items").replaceChildren();
  if ($("vocabulary-study")) $("vocabulary-study").hidden = false;
  if ($("vocabulary-card")) $("vocabulary-card").hidden = false;
  if ($("vocabulary-study-complete")) $("vocabulary-study-complete").hidden = true;
  if ($("vocabulary-exercises")) $("vocabulary-exercises").hidden = true;
  if ($("vocabulary-quiz")) $("vocabulary-quiz").hidden = true;
  if ($("vocabulary-practice")) $("vocabulary-practice").hidden = true;
  if ($("vocabulary-completion")) $("vocabulary-completion").hidden = true;
  if ($("vocabulary-word-select")) $("vocabulary-word-select").replaceChildren();
  if ($("vocabulary-feedback")) { $("vocabulary-feedback").replaceChildren(); $("vocabulary-feedback").hidden = true; }
  if ($("vocabulary-sentence")) $("vocabulary-sentence").value = "";
  if ($("vocabulary-word-position")) $("vocabulary-word-position").textContent = "";
  if ($("vocabulary-word-text")) $("vocabulary-word-text").textContent = "";
  if ($("vocabulary-example-text")) $("vocabulary-example-text").textContent = "";
  setMessage("vocabulary-status");
  setMessage("vocabulary-quiz-status");
  setMessage("vocabulary-evaluate-status");
}

function configureVocabularySpeechButton(button, label) {
  button.dataset.speechCompact = "true";
  button.dataset.speechLabel = label;
  setSpeechState(button, "idle");
}

function updateVocabularyExerciseProgress() {
  if (!vocabularyState.lesson) return;
  const progress = vocabularyState.lesson.progress || {};
  const quizCompleted = progress.quizCompleted ? VOCABULARY_QUIZ_QUESTION_COUNT : vocabularyState.quizAnswers.size;
  const completed = quizCompleted + (progress.writingCompleted ? 1 : 0);
  $("vocabulary-exercise-progress").textContent = `${completed}/${VOCABULARY_EXERCISE_TOTAL} concluídos`;
}

function showVocabularyCompletion() {
  const lesson = vocabularyState.lesson;
  if (!lesson?.progress?.completedAt) return;
  $("vocabulary-study-complete").hidden = true;
  $("vocabulary-exercises").hidden = true;
  $("vocabulary-completion-quiz").textContent = `${lesson.progress.quizScore}/${VOCABULARY_QUIZ_QUESTION_COUNT} no quiz`;
  $("vocabulary-completion-words").textContent = `${lesson.words.length} palavras estudadas`;
  $("vocabulary-completion-writing").textContent = "1 frase escrita";
  $("vocabulary-completion").hidden = false;
}

function renderVocabularyProgressSteps() {
  const box = $("vocabulary-progress-steps");
  box.replaceChildren();
  vocabularyState.lesson.words.forEach((_, index) => {
    const step = document.createElement("span");
    step.className = index === vocabularyState.currentWordIndex ? "current" : index <= vocabularyState.furthestWordIndex ? "visited" : "";
    box.append(step);
  });
}

function renderCurrentVocabularyWord() {
  const lesson = vocabularyState.lesson;
  if (!lesson) return;
  stopSpeech();
  const word = lesson.words[vocabularyState.currentWordIndex];
  const position = vocabularyState.currentWordIndex + 1;
  $("vocabulary-word-position").textContent = `${position} de ${lesson.words.length}`;
  $("vocabulary-study-caption").textContent = position === lesson.words.length ? "Última palavra" : "Palavra atual";
  $("vocabulary-word-text").textContent = word.word;
  $("vocabulary-word-translation").textContent = word.translation;
  $("vocabulary-example-text").textContent = word.example;
  $("vocabulary-example-translation").textContent = word.exampleTranslation;
  $("vocabulary-word-status").textContent = vocabularyProgressLabels[word.status] || "";
  $("vocabulary-word-status").className = `vocabulary-word-status status-${String(word.status || "new").toLowerCase()}`;
  $("vocabulary-review-badge").hidden = !word.review;
  $("vocabulary-word-audio").dataset.speechLabel = `Ouvir a palavra ${word.word}`;
  $("vocabulary-example-audio").dataset.speechLabel = `Ouvir o exemplo de ${word.word}`;
  setSpeechState($("vocabulary-word-audio"), "idle");
  setSpeechState($("vocabulary-example-audio"), "idle");
  $("vocabulary-previous-word").disabled = vocabularyState.currentWordIndex === 0;
  const completed = Boolean(lesson.progress?.completedAt);
  $("vocabulary-next-word").disabled = completed && position === lesson.words.length;
  $("vocabulary-next-word").textContent = position === lesson.words.length
    ? completed ? "Fim da revisão" : "Concluir estudo"
    : "Próxima palavra →";
  renderVocabularyProgressSteps();
}

function renderVocabulary(lesson, ownerId = appState.currentUser?.id) {
  vocabularyState.lesson = lesson;
  vocabularyState.ownerId = ownerId;
  vocabularyState.currentWordIndex = 0;
  vocabularyState.furthestWordIndex = 0;
  vocabularyState.wordsStudied = Boolean(lesson.progress?.quizCompleted || lesson.progress?.completedAt);
  vocabularyState.quizWords = lesson.words.slice(0, VOCABULARY_QUIZ_QUESTION_COUNT);
  vocabularyState.quizIndex = 0;
  vocabularyState.quizAnswers = new Map();
  vocabularyState.quizScore = lesson.progress?.quizScore || 0;
  vocabularyState.questionAnswered = false;
  vocabularyState.quizSubmitting = false;
  vocabularyState.evaluating = false;
  const category = vocabularyCategoryLabels[lesson.category] || lesson.category;
  $("vocabulary-meta").textContent = `Tema: ${category}`;
  $("vocabulary-level").textContent = `Nível ${lesson.englishLevel}`;
  $("vocabulary-count").textContent = `${lesson.words.length} palavras`;
  $("vocabulary-exercise-progress").textContent = `0/${VOCABULARY_EXERCISE_TOTAL} concluídos`;
  $("vocabulary-study").hidden = false;
  $("vocabulary-study-complete").hidden = true;
  $("vocabulary-exercises").hidden = true;
  $("vocabulary-quiz").hidden = true;
  $("vocabulary-practice").hidden = true;
  $("vocabulary-completion").hidden = true;
  $("vocabulary-quiz-score").textContent = "";
  setMessage("vocabulary-quiz-status");
  $("vocabulary-sentence").value = "";
  $("vocabulary-feedback").hidden = true;
  $("vocabulary-feedback").replaceChildren();
  setMessage("vocabulary-evaluate-status");
  $("vocabulary-exercises-button").disabled = false;
  $("vocabulary-exercises-button").textContent = "Começar exercícios";
  const select = $("vocabulary-word-select");
  select.replaceChildren();
  lesson.words.forEach(word => {
    const option = document.createElement("option");
    option.value = word.id;
    option.textContent = word.word;
    select.append(option);
  });
  $("vocabulary-evaluate").disabled = false;
  $("vocabulary-evaluate").textContent = "Avaliar frase";
  renderCurrentVocabularyWord();
  updateVocabularyExerciseProgress();
  if (lesson.progress?.completedAt) {
    $("vocabulary-study").hidden = true;
    showVocabularyCompletion();
  } else if (lesson.progress?.quizCompleted) {
    $("vocabulary-study").hidden = true;
    $("vocabulary-exercises").hidden = false;
    $("vocabulary-practice").hidden = false;
  }
}

function vocabularyQuizOptions(question, questionIndex) {
  const choices = [question];
  for (let offset = 1; choices.length < 4 && offset < vocabularyState.lesson.words.length; offset++) {
    const candidate = vocabularyState.lesson.words[(questionIndex + offset) % vocabularyState.lesson.words.length];
    if (!choices.some(item => item.id === candidate.id)) choices.push(candidate);
  }
  const rotation = questionIndex % choices.length;
  return choices.slice(rotation).concat(choices.slice(0, rotation));
}

function renderVocabularyQuizQuestion() {
  const box = $("vocabulary-quiz-items");
  box.replaceChildren();
  const questionIndex = vocabularyState.quizIndex;
  const word = vocabularyState.quizWords[questionIndex];
  vocabularyState.questionAnswered = false;
  $("vocabulary-question-position").textContent = `Questão ${questionIndex + 1} de ${VOCABULARY_QUIZ_QUESTION_COUNT}`;
  const card = document.createElement("article");
  card.className = "reading-question vocabulary-question";
  const title = document.createElement("h4");
  title.textContent = `What does “${word.word}” mean?`;
  const options = document.createElement("div");
  options.className = "reading-question-options";
  vocabularyQuizOptions(word, questionIndex).forEach(option => {
    const label = document.createElement("label");
    label.className = "reading-answer-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `vocabulary-question-${questionIndex}`;
    input.value = option.id;
    const text = document.createElement("span");
    text.className = "reading-answer-text";
    text.textContent = option.translation;
    label.append(input, text);
    options.append(label);
  });
  const action = document.createElement("button");
  action.className = "secondary small-action";
  action.type = "button";
  action.textContent = "Confirmar";
  const result = document.createElement("div");
  result.className = "reading-question-result";
  result.hidden = true;
  action.addEventListener("click", async () => {
    if (!vocabularyState.questionAnswered) {
      const selected = [...options.children].find(label => label.children[0].checked);
      if (!selected) return;
      const selectedWordId = selected.children[0].value;
      const correct = selectedWordId === word.id;
      vocabularyState.quizAnswers.set(word.id, selectedWordId);
      if (correct) vocabularyState.quizScore++;
      [...options.children].forEach(label => {
        label.children[0].disabled = true;
        if (label.children[0].value === word.id) label.classList.add("correct");
        if (label.children[0].value === selectedWordId && !correct) label.classList.add("incorrect");
      });
      vocabularyState.questionAnswered = true;
      result.hidden = false;
      result.textContent = correct ? "✓ Correto" : "✗ Incorreto";
      updateVocabularyExerciseProgress();
      action.textContent = questionIndex === VOCABULARY_QUIZ_QUESTION_COUNT - 1 ? "Continuar para escrita" : "Próxima questão";
      return;
    }
    if (questionIndex < VOCABULARY_QUIZ_QUESTION_COUNT - 1) {
      vocabularyState.quizIndex++;
      renderVocabularyQuizQuestion();
      return;
    }
    await submitVocabularyQuiz(action);
  });
  card.append(title, options, action, result);
  box.append(card);
}

function renderVocabularyQuiz() {
  vocabularyState.quizWords = vocabularyState.lesson.words.slice(0, VOCABULARY_QUIZ_QUESTION_COUNT);
  vocabularyState.quizIndex = 0;
  vocabularyState.quizAnswers = new Map();
  vocabularyState.quizScore = 0;
  $("vocabulary-quiz-score").textContent = "";
  setMessage("vocabulary-quiz-status");
  renderVocabularyQuizQuestion();
  $("vocabulary-quiz").hidden = false;
}

function startVocabularyExercises() {
  if (!vocabularyState.lesson || !vocabularyState.wordsStudied || vocabularyState.lesson.progress?.completedAt) return;
  $("vocabulary-study-complete").hidden = true;
  $("vocabulary-exercises").hidden = false;
  renderVocabularyQuiz();
  updateVocabularyExerciseProgress();
}

async function submitVocabularyQuiz(action) {
  if (vocabularyState.quizSubmitting || vocabularyState.quizAnswers.size !== VOCABULARY_QUIZ_QUESTION_COUNT) return;
  const lesson = vocabularyState.lesson, ownerId = appState.currentUser?.id, version = vocabularyState.version;
  const controller = new AbortController();
  vocabularyState.quizController = controller;
  const isCurrent = () => vocabularyState.quizController === controller && vocabularyState.lesson === lesson
    && vocabularyState.version === version && vocabularyState.ownerId === ownerId && appState.currentUser?.id === ownerId;
  vocabularyState.quizSubmitting = true;
  action.disabled = true;
  setButtonBusy(action, true);
  action.textContent = "Salvando resultado...";
  setMessage("vocabulary-quiz-status");
  try {
    const answers = vocabularyState.quizWords.map(word => ({ wordId: word.id, selectedWordId: vocabularyState.quizAnswers.get(word.id) }));
    const result = await authenticatedRequest("/api/v1/vocabulary/quiz", {
      method: "POST", signal: controller.signal, body: JSON.stringify({ lessonId: lesson.id, answers })
    });
    if (!isCurrent()) return;
    if (result.sessionInvalid || result.response.status === 401) return showLogin("Sua sessão expirou. Entre novamente.");
    if (!result.response.ok) {
      setMessage("vocabulary-quiz-status", errorMessage(result.response.status));
      action.disabled = false;
      action.textContent = "Tentar continuar";
      return;
    }
    vocabularyState.quizScore = result.body.score;
    vocabularyState.lesson.progress = result.body.progress;
    $("vocabulary-quiz-score").textContent = `Resultado: ${result.body.score} de ${result.body.total}`;
    $("vocabulary-quiz").hidden = true;
    $("vocabulary-practice").hidden = false;
    updateVocabularyExerciseProgress();
  } catch (_) {
    if (isCurrent()) {
      setMessage("vocabulary-quiz-status", "Não foi possível salvar o resultado. Tente novamente.");
      action.disabled = false;
      action.textContent = "Tentar continuar";
    }
  } finally {
    if (vocabularyState.quizController === controller) {
      vocabularyState.quizController = null;
      vocabularyState.quizSubmitting = false;
      setButtonBusy(action, false);
    }
  }
}

async function evaluateVocabularySentence() {
  if (vocabularyState.evaluating || vocabularyState.lesson?.progress?.writingCompleted || !vocabularyState.lesson) return;
  const sentence = $("vocabulary-sentence").value;
  const wordId = $("vocabulary-word-select").value;
  if (!sentence.trim()) return setMessage("vocabulary-evaluate-status", "Escreva uma frase em inglês.");
  const lesson = vocabularyState.lesson, ownerId = appState.currentUser?.id, version = vocabularyState.version;
  const controller = new AbortController();
  vocabularyState.evaluationController = controller;
  const isCurrent = () => vocabularyState.evaluationController === controller && vocabularyState.lesson === lesson
    && vocabularyState.version === version && vocabularyState.ownerId === ownerId && appState.currentUser?.id === ownerId;
  vocabularyState.evaluating = true;
  $("vocabulary-evaluate").disabled = true;
  setButtonBusy($("vocabulary-evaluate"), true);
  setMessage("vocabulary-evaluate-status", "Avaliando frase...");
  try {
    const result = await authenticatedRequest("/api/v1/vocabulary/evaluate", { method: "POST", signal: controller.signal, body: JSON.stringify({ lessonId: lesson.id, wordId, sentence }) });
    if (!isCurrent()) return;
    if (result.sessionInvalid || result.response.status === 401) return showLogin("Sua sessão expirou. Entre novamente.");
    if (!result.response.ok) {
      setMessage("vocabulary-evaluate-status", errorMessage(result.response.status));
    } else {
      const data = result.body;
      const box = $("vocabulary-feedback");
      box.replaceChildren();
      const state = document.createElement("strong");
      state.textContent = data.status === "CORRECT" ? "✓ Sua frase está correta!" : data.status === "NEEDS_IMPROVEMENT" ? "Quase!" : "Vamos revisar";
      const explanation = document.createElement("p");
      explanation.textContent = data.explanation || "";
      box.append(state, explanation);
      if (data.correctedSentence) {
        const correction = document.createElement("p");
        correction.textContent = data.correctedSentence;
        box.append(correction);
      }
      if (data.alternative) {
        const alternative = document.createElement("p");
        alternative.textContent = data.alternative;
        box.append(alternative);
      }
      box.hidden = false;
      vocabularyState.lesson.progress = data.progress;
      $("vocabulary-evaluate").textContent = "Atividade concluída";
      setMessage("vocabulary-evaluate-status", "Frase avaliada.", true);
      updateVocabularyExerciseProgress();
      showVocabularyCompletion();
    }
  } catch (_) {
    if (isCurrent()) setMessage("vocabulary-evaluate-status", "Não foi possível avaliar a frase.");
  } finally {
    if (vocabularyState.evaluationController === controller) {
      vocabularyState.evaluationController = null;
      vocabularyState.evaluating = false;
      setButtonBusy($("vocabulary-evaluate"), false);
      $("vocabulary-evaluate").disabled = Boolean(vocabularyState.lesson?.progress?.writingCompleted);
    }
  }
}

async function loadVocabulary() {
  const ownerId = appState.currentUser?.id;
  if (!ownerId) return;
  if (vocabularyState.lesson && vocabularyState.ownerId === ownerId) return;
  if (vocabularyState.loadController && vocabularyState.ownerId === ownerId) return;
  if (vocabularyState.lesson || vocabularyState.loadController) resetVocabulary();
  const controller = new AbortController(), version = ++vocabularyState.version;
  vocabularyState.loadController = controller;
  vocabularyState.ownerId = ownerId;
  const isCurrent = () => vocabularyState.loadController === controller && vocabularyState.version === version
    && vocabularyState.ownerId === ownerId && appState.currentUser?.id === ownerId;
  const finishLoading = startLoading("vocabulary-loading");
  $("vocabulary-card").hidden = true;
  setMessage("vocabulary-status");
  try {
    const result = await authenticatedRequest("/api/v1/vocabulary/today", { signal: controller.signal });
    if (!isCurrent()) return;
    if (result.sessionInvalid || result.response.status === 401) return showLogin("Sua sessão expirou. Entre novamente.");
    if (!result.response.ok) return setMessage("vocabulary-status", errorMessage(result.response.status));
    if (!result.body || !Array.isArray(result.body.words) || result.body.words.length !== VOCABULARY_ITEMS_PER_LESSON) return setMessage("vocabulary-status", "Não foi possível carregar uma lição válida.");
    renderVocabulary(result.body, ownerId);
    $("vocabulary-card").hidden = false;
    setMessage("vocabulary-status");
  } catch (error) {
    if (isCurrent() && error?.name !== "AbortError") setMessage("vocabulary-status", "Não foi possível carregar o vocabulário. Tente novamente.");
  } finally {
    finishLoading();
    if (vocabularyState.loadController === controller) vocabularyState.loadController = null;
  }
}
configureVocabularySpeechButton($("vocabulary-word-audio"), "Ouvir palavra");
configureVocabularySpeechButton($("vocabulary-example-audio"), "Ouvir exemplo");
$("vocabulary-word-audio").addEventListener("click", () => {
  const word = vocabularyState.lesson?.words[vocabularyState.currentWordIndex];
  if (word) playSpeech($("vocabulary-word-audio"), $("vocabulary-status"), word.word, "en", false, undefined, false);
});
$("vocabulary-example-audio").addEventListener("click", () => {
  const word = vocabularyState.lesson?.words[vocabularyState.currentWordIndex];
  if (word) playSpeech($("vocabulary-example-audio"), $("vocabulary-status"), word.example, "en", false, undefined, false);
});
$("vocabulary-previous-word").addEventListener("click", () => {
  if (!vocabularyState.lesson || vocabularyState.currentWordIndex === 0) return;
  vocabularyState.currentWordIndex--;
  renderCurrentVocabularyWord();
});
$("vocabulary-next-word").addEventListener("click", () => {
  if (!vocabularyState.lesson) return;
  if (vocabularyState.currentWordIndex < vocabularyState.lesson.words.length - 1) {
    vocabularyState.currentWordIndex++;
    vocabularyState.furthestWordIndex = Math.max(vocabularyState.furthestWordIndex, vocabularyState.currentWordIndex);
    renderCurrentVocabularyWord();
    return;
  }
  if (vocabularyState.lesson.progress?.completedAt) return;
  stopSpeech();
  vocabularyState.wordsStudied = true;
  $("vocabulary-study").hidden = true;
  $("vocabulary-study-complete").hidden = false;
});
$("vocabulary-exercises-button").addEventListener("click", startVocabularyExercises);
$("vocabulary-evaluate").addEventListener("click", evaluateVocabularySentence);
$("vocabulary-review-button").addEventListener("click", () => {
  vocabularyState.currentWordIndex = 0;
  vocabularyState.furthestWordIndex = vocabularyState.lesson.words.length - 1;
  $("vocabulary-study").hidden = false;
  renderCurrentVocabularyWord();
});
window.addEventListener("pagehide",resetVocabulary);

const googleScript = document.createElement("script"); googleScript.src = "https://accounts.google.com/gsi/client"; googleScript.async = true; googleScript.onload = prepareGoogle; document.head.appendChild(googleScript); setVoiceState("idle"); showHome();
