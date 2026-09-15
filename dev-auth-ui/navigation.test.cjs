const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const id = "11111111-1111-4111-8111-111111111111";
const scenarios = ["RESTAURANT", "JOB_INTERVIEW", "FREE_TALK"].map(key => ({
  id: key, displayName: key, description: "Practice", assistantDisplayName: key === "RESTAURANT" ? "Layla" : "Rodrigo",
  assistantAvatarKey: "avatar", assistantAvatarImageUrl: "/api/v1/avatars/avatar/image"
}));
const conversation = scenario => ({ ...scenarios.find(s => s.id === scenario), id, scenario, language: "en", title: "Practice" });
const detail = scenario => ({ conversation: conversation(scenario), messages: [
  { role: "ASSISTANT", content: "A scenario-specific opening." },
  { role: "USER", content: "An existing answer." }
] });

// Runs the complete, unmodified application script and its actual event handlers.
// The DOM and HTTP boundary are fake; no packages, browser credentials or real LLM are needed.
class Element {
  constructor(id = "") {
    Object.assign(this, { id, children: [], dataset: {}, handlers: {}, attributes: {}, value: "", hidden: true, disabled: false, textContent: "" });
    const classes = new Set();
    this.classList = { add: (...x) => x.forEach(c => classes.add(c)), remove: (...x) => x.forEach(c => classes.delete(c)),
      contains: x => classes.has(x), toggle: (x, force) => { if (force ?? !classes.has(x)) classes.add(x); else classes.delete(x); } };
  }
  addEventListener(type, handler) { (this.handlers[type] ??= []).push(handler); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  append(...children) { children.forEach(child => { child.parentElement = this; this.children.push(child); }); }
  appendChild(child) { this.append(child); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  replaceWith() {}
  remove() {}
  scrollTo() {}
  focus() {}
  querySelectorAll() { return []; }
  async click() { if (this.disabled) return; if (this.onclick) await this.onclick(); for (const fn of this.handlers.click ?? []) await fn({ preventDefault() {}, currentTarget: this }); }
}
async function app({ authenticated = false, handle } = {}) {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m => [m[1], new Element(m[1])]));
  const get = key => { assert.ok(elements.has(key), `DOM id exists: ${key}`); return elements.get(key); };
  const nav = [...html.matchAll(/<button\b([^>]*data-view="([^"]+)"[^>]*)>([\s\S]*?)<\/button>/g)].map(m => {
    const el = new Element(); el.dataset.view = m[2]; el.textContent = m[3].replace(/<[^>]+>/g, "").trim(); return el;
  });
  const pages = [...elements.values()].filter(el => el.id.startsWith("view-"));
  get("chat-language").value = "en";
  get("chat-mode").value = "text";
  const storage = new Map(authenticated ? [["englishai_access_token", "test-access"], ["englishai_refresh_token", "test-refresh"]] : []);
  const calls = [];
  const sandbox = {
    document: { getElementById: get, createElement: () => new Element(), head: new Element(),
      querySelectorAll: selector => selector === ".page-view" ? pages : selector === "[data-view]" ? nav
        : selector.startsWith('[data-view="') ? nav.filter(el => selector === `[data-view="${el.dataset.view}"]`) : [] },
    window: { addEventListener() {}, matchMedia: () => ({ matches: false }), confirm: () => true },
    navigator: {}, sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    performance, AbortController, FormData, Event, TextDecoder, URL, setTimeout, clearTimeout, console,
    fetch: async (url, options = {}) => {
      const request = { path: new URL(url).pathname, method: options.method ?? "GET", body: options.body ? JSON.parse(options.body) : undefined };
      calls.push(request);
      const custom = await handle?.(request);
      if (custom) return new Response(JSON.stringify(custom.body ?? {}), { status: custom.status ?? 200 });
      const bodies = { "/api/v1/users/me": { id: "owner", username: "Learner" }, "/api/v1/users/me/profile": {},
        "/api/v1/avatars": [], "/api/v1/conversation-scenarios": scenarios, "/api/v1/conversations": [conversation("JOB_INTERVIEW")] };
      if (request.path.endsWith("/messages/stream")) return new Response("{}", { status: 503 });
      return new Response(JSON.stringify(bodies[request.path] ?? {}));
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const run = code => vm.runInContext(code, sandbox);
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  if (!authenticated) run('appState.currentUser = { id: "owner" };');
  return { get, nav, calls, run, storage, state: () => run("appState"), click: name => nav.find(el => el.textContent === name).click() };
}

test("Home CTA navigates to Scenarios and never creates a conversation", async () => {
  const ui = await app(); await ui.run('showView("home")'); await ui.click("Começar uma conversa");
  assert.equal(ui.state().currentView, "scenarios"); assert.equal(ui.get("view-chat").hidden, true);
  assert.equal(ui.get("scenario-list").children.length, 3);
  assert.equal(ui.calls.filter(r => r.method === "POST").length, 0);
});

test("Every chat navigation entry redirects without a loaded conversation", async () => {
  const ui = await app();
  for (const button of ui.nav.filter(el => el.dataset.view === "chat")) {
    await button.click(); assert.equal(ui.state().currentView, "scenarios"); assert.equal(ui.get("view-chat").hidden, true);
  }
  await ui.run('showView("chat")'); assert.equal(ui.state().currentView, "scenarios");
});

for (const scenario of ["RESTAURANT", "JOB_INTERVIEW", "FREE_TALK"]) {
  test(`${scenario}: scenario button creates once, fetches detail and renders the persisted opening`, async () => {
    const ui = await app({ handle: req => req.method === "POST" && req.path === "/api/v1/conversations"
      ? { body: conversation(scenario) } : req.path === `/api/v1/conversations/${id}` ? { body: detail(scenario) } : null });
    await ui.run('showView("scenarios")');
    const card = ui.get("scenario-list").children[scenarios.findIndex(s => s.id === scenario)];
    await card.children.find(el => el.textContent === "Iniciar conversa").click();
    assert.equal(ui.state().currentView, "chat"); assert.equal(ui.state().currentConversation.scenario, scenario);
    assert.equal(ui.get("chat-messages").children[0].children[1].textContent, "A scenario-specific opening.");
    assert.equal(ui.get("chat-assistant-name").textContent, conversation(scenario).assistantDisplayName);
    const writes = ui.calls.filter(req => req.method === "POST"); assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].body, { scenario, language: "en" });
    assert.ok(ui.calls.some(req => req.path === `/api/v1/conversations/${id}` && req.method === "GET"));
  });
}

test("Conversations reopens an existing detail without POST and restores original language and history", async () => {
  const stored = detail("JOB_INTERVIEW"); stored.conversation.language = "pt";
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? { body: stored } : null });
  await ui.run('showView("conversations")');
  const actions = ui.get("conversation-list").children[0].children.at(-1);
  await actions.children[0].click();
  assert.equal(ui.state().currentView, "chat"); assert.equal(ui.get("chat-messages").children.length, 2);
  assert.equal(ui.get("chat-language").value, "pt"); assert.equal(ui.get("chat-language").disabled, true);
  assert.equal(ui.calls.filter(req => req.method === "POST").length, 0);
});

for (const invalid of [{ status: 404 }, { body: { conversation: { id }, messages: [] } },
  { body: { conversation: conversation("JOB_INTERVIEW") } }]) {
  test(`Invalid or failed detail cannot open chat: ${JSON.stringify(invalid)}`, async () => {
    const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? invalid : null });
    await ui.run(`openConversation("${id}")`);
    assert.equal(ui.state().currentConversation, null); assert.equal(ui.get("view-chat").hidden, true);
    assert.equal(ui.state().currentView, "conversations");
  });
}

test("Successful creation followed by failed detail does not open empty chat or repeat creation", async () => {
  const ui = await app({ handle: req => req.method === "POST" ? { body: conversation("JOB_INTERVIEW") }
    : req.path === `/api/v1/conversations/${id}` ? { status: 404 } : null });
  await ui.run('showView("scenarios")'); await ui.run('createConversation("JOB_INTERVIEW")');
  assert.equal(ui.state().currentConversation, null); assert.equal(ui.get("view-chat").hidden, true);
  assert.equal(ui.calls.filter(req => req.method === "POST").length, 1);
});

test("Logout clears conversation and rendered history immediately, without deleting persistence", async () => {
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run(`openConversation("${id}")`); await ui.run("logout()");
  assert.equal(ui.state().currentConversation, null); assert.equal(ui.get("chat-messages").children.length, 0);
  assert.equal(ui.get("view-chat").hidden, true); assert.equal(ui.calls.some(req => req.method === "DELETE"), false);
});

test("Late detail after logout cannot restore previous user's conversation", async () => {
  let resolve;
  const response = new Promise(done => { resolve = done; });
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? response : null });
  const opening = ui.run(`openConversation("${id}")`); await ui.run("logout()");
  resolve({ body: detail("JOB_INTERVIEW") }); await opening;
  assert.equal(ui.state().currentConversation, null); assert.equal(ui.get("view-chat").hidden, true);
});

test("Navigating away clears temporary selection, and a late creation cannot force chat navigation", async () => {
  let resolve; const response = new Promise(done => { resolve = done; });
  const ui = await app({ handle: req => req.method === "POST" ? response : null });
  await ui.run('showView("scenarios")'); const creating = ui.run('createConversation("JOB_INTERVIEW")');
  await ui.run('showView("home")'); resolve({ body: conversation("JOB_INTERVIEW") }); await creating;
  assert.equal(ui.state().currentView, "home"); assert.equal(ui.state().currentConversation, null);
});

test("Missing scenario never creates FREE_TALK implicitly", async () => {
  const ui = await app(); await ui.run('showView("scenarios")');
  await ui.run('createConversation(null)'); await ui.run('createConversation("NONEXISTENT")');
  assert.equal(ui.calls.filter(req => req.method === "POST").length, 0);
});

test("Authenticated browser refresh starts at Scenarios with no invented selection", async () => {
  const ui = await app({ authenticated: true });
  assert.equal(ui.state().currentView, "scenarios"); assert.equal(ui.state().currentConversation, null);
  assert.equal(ui.get("view-chat").hidden, true); assert.equal(ui.calls.filter(req => req.method === "POST").length, 0);
});

test("Sending without a loaded conversation redirects, never using legacy chat", async () => {
  const ui = await app();
  await ui.run('sendChatMessage("Hello", "en", { generation: conversationGeneration })');
  assert.equal(ui.state().currentView, "scenarios"); assert.equal(ui.calls.filter(req => req.method === "POST").length, 0);
  assert.equal(source.includes('"/api/v1/chat/stream"'), false);
});

test("New conversation button leaves persisted chat and navigates to scenario choice", async () => {
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run(`openConversation("${id}")`); await ui.get("clear-chat").click();
  assert.equal(ui.state().currentView, "scenarios"); assert.equal(ui.state().currentConversation, null);
  assert.equal(ui.calls.some(req => req.method === "DELETE"), false);
});


test("Valid chat sends only to its persistent endpoint and keeps Backend language", async () => {
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run(`openConversation("${id}")`);
  await ui.run('sendChatMessage("Hello", "pt", { generation: conversationGeneration, voice: false })');
  const writes = ui.calls.filter(req => req.method === "POST");
  assert.equal(writes.length, 1); assert.equal(writes[0].path, `/api/v1/conversations/${id}/messages/stream`);
  assert.deepEqual(writes[0].body, { message: "Hello" });
  assert.equal(ui.get("chat-language").value, "en"); assert.equal(ui.get("chat-language").disabled, true);
});

test("Repeated start clicks while generating cannot issue a second creation", async () => {
  let resolve; const response = new Promise(done => { resolve = done; });
  const ui = await app({ handle: req => req.method === "POST" ? response
    : req.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run('showView("scenarios")'); const first = ui.run('createConversation("JOB_INTERVIEW")');
  await ui.run('createConversation("JOB_INTERVIEW")'); resolve({ body: conversation("JOB_INTERVIEW") }); await first;
  assert.equal(ui.calls.filter(req => req.method === "POST").length, 1);
  assert.equal(ui.state().currentView, "chat");
});
