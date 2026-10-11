const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const scenario = { id: "scenario-id", key: "TEST_SCENARIO", displayName: "Practice", description: "Description",
  assistantDisplayName: "Legacy", assistantAvatarKey: "avatar", behaviorInstructions: "Keep the existing instructions.",
  enabled: true, sortOrder: 4, ttsVoice: "en_US-lessac-high", speechRate: 0.85 };

function app({ unavailable = false } = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: "", value: "", handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; } });
    return elements.get(id);
  };
  const calls = [];
  const storage = new Map();
  const sandbox = { document: { getElementById: element, querySelectorAll: () => [], createElement: () => ({}), head: { appendChild() {} } },
    window: { confirm: () => true }, sessionStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, FormData,
    fetch: async (url, options = {}) => {
      const request = { path: new URL(url).pathname, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : undefined };
      calls.push(request);
      if (request.path.endsWith("/tts/voices")) return new Response(JSON.stringify([
        { key: "en_US-lessac-high", displayName: "Lessac High", language: "en" },
        { key: "pt_BR-faber-medium", displayName: "Faber Medium", language: "pt" }
      ]), { status: unavailable ? 503 : 200 });
      return new Response(JSON.stringify(request.method === "GET" ? [] : { ...scenario, ...request.body }));
    }, element };
  vm.createContext(sandbox);
  const run = code => vm.runInContext(code, sandbox);
  run(source);
  // Keep HTTP, form generation and submit logic real; replace only the modal DOM boundary.
  run('modal = (title, body, submit) => { globalThis.dialog = { title, body, submit }; return { querySelector: element }; }; avatarRows = [{ key: "avatar", displayName: "Assistant" }];');
  return { run, calls, element, sandbox, storage };
}

test("Admin escapes API values before inserting them in HTML", async () => {
  const ui = app();
  const payload = '" autofocus onfocus="alert(1)';
  ui.run(`avatarForm(${JSON.stringify({ key: "avatar", displayName: payload, sortOrder: payload })})`);
  assert.match(ui.sandbox.dialog.body, /value="&quot; autofocus onfocus=&quot;alert\(1\)"/);
  assert.doesNotMatch(ui.sandbox.dialog.body, /value="" autofocus/);
  await ui.run(`scenarioForm(${JSON.stringify({ ...scenario, sortOrder: payload, description: '<script>alert(1)</script>' })})`);
  assert.match(ui.sandbox.dialog.body, /value="&quot; autofocus onfocus=&quot;alert\(1\)"/);
  assert.match(ui.sandbox.dialog.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(ui.sandbox.dialog.body, /<script>alert\(1\)<\/script>/);
  ui.run(`avatarRows = [{ id: "a", key: "avatar", displayName: ${JSON.stringify('<img src=x onerror=alert(1)>')}, sortOrder: 1, enabled: true }]; renderAvatars()`);
  assert.match(ui.element("content").innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(ui.element("content").innerHTML, /<img src=x onerror/);
  ui.run(`renderUsers([{ id: "u", email: ${JSON.stringify('<script>alert(1)</script>')}, role: "USER" }])`);
  assert.match(ui.element("content").innerHTML, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("Admin keeps tokens in sessionStorage and removes both on logout", async () => {
  const ui = app();
  ui.run('saveTokens({ accessToken: "access-example", refreshToken: "refresh-example" })');
  assert.equal(ui.storage.get("englishai_admin_access_token"), "access-example");
  assert.equal(ui.storage.get("englishai_admin_refresh_token"), "refresh-example");
  await ui.run('$("logout").onclick()');
  assert.equal(ui.storage.size, 0);
});

test("Admin refreshes a legacy access token once and saves the rotated token family", async () => {
  const ui = app();
  const calls = [];
  ui.run('saveTokens({ accessToken: "legacy-access", refreshToken: "still-valid-refresh" })');
  ui.sandbox.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    const auth = options.headers?.Authorization;
    calls.push({ path, auth, body: options.body ? JSON.parse(options.body) : null });
    let status = 200;
    let body = { id: "user-id", role: "ADMIN" };
    if (path === "/api/v1/users/me" && auth === "Bearer legacy-access") status = 401;
    if (path === "/api/v1/auth/refresh") body = { accessToken: "session-access", refreshToken: "rotated-refresh" };
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };

  const result = await ui.run('api("/api/v1/users/me")');

  assert.equal(result.response.status, 200);
  assert.deepEqual(calls.map(call => call.path), ["/api/v1/users/me", "/api/v1/auth/refresh", "/api/v1/users/me"]);
  assert.equal(calls[1].body.refreshToken, "still-valid-refresh");
  assert.equal(calls[2].auth, "Bearer session-access");
  assert.equal(ui.storage.get("englishai_admin_access_token"), "session-access");
  assert.equal(ui.storage.get("englishai_admin_refresh_token"), "rotated-refresh");
});

test("Admin loads saved voice and speed from the scenario and renders live rate feedback", async () => {
  const ui = app();
  await ui.run(`scenarioForm(${JSON.stringify(scenario)})`);
  assert.equal(ui.calls[0].path, "/api/v1/admin/tts/voices");
  assert.match(ui.sandbox.dialog.body, /value="en_US-lessac-high" selected/);
  assert.match(ui.sandbox.dialog.body, /Lessac High — EN/);
  assert.match(ui.sandbox.dialog.body, />0\.85x<\/output>/);
  assert.match(ui.sandbox.dialog.body, /min="0\.75" max="1\.25" step="0\.01" value="0\.85"/);
  ui.element("#scenario-speech-rate").handlers.input({ target: { value: "1.12" } });
  assert.equal(ui.element("#scenario-speech-rate-value").textContent, "1.12x");
});

test("Admin submits new voice and speed while preserving avatar and behavior", async () => {
  const ui = app();
  await ui.run(`scenarioForm(${JSON.stringify(scenario)})`);
  const fd = new FormData();
  for (const [key, value] of Object.entries({ ...scenario, ttsVoice: "pt_BR-faber-medium", speechRate: 1.15 })) fd.set(key, String(value));
  let removed = false;
  await ui.sandbox.dialog.submit(fd, { remove() { removed = true; } }, {});
  const saved = ui.calls.find(req => req.method === "PUT");
  assert.equal(saved.path, "/api/v1/admin/conversation-scenarios/scenario-id");
  assert.equal(saved.body.ttsVoice, "pt_BR-faber-medium");
  assert.equal(saved.body.speechRate, 1.15);
  assert.equal(saved.body.assistantAvatarKey, scenario.assistantAvatarKey);
  assert.equal(saved.body.behaviorInstructions, scenario.behaviorInstructions);
  assert.equal(removed, true);
});

test("New scenario uses language default and 1.00x without hardcoded voice options", async () => {
  const ui = app();
  await ui.run("scenarioForm()");
  assert.match(ui.sandbox.dialog.body, /value="" selected>Padrão do idioma/);
  assert.match(ui.sandbox.dialog.body, />1\.00x<\/output>/);
});

test("Unavailable voice catalog keeps the persisted selection editable without silently resetting it", async () => {
  const ui = app({ unavailable: true });
  await ui.run(`scenarioForm(${JSON.stringify(scenario)})`);
  assert.match(ui.sandbox.dialog.body, /value="en_US-lessac-high" selected>Voz configurada/);
  assert.match(ui.sandbox.dialog.body, /Catálogo de vozes indisponível/);
});

test("Toggling a scenario preserves its speech settings and existing instructions", async () => {
  const ui = app();
  await ui.run(`toggleScenario(${JSON.stringify(scenario)})`);
  const saved = ui.calls.find(req => req.method === "PUT").body;
  assert.equal(saved.enabled, false);
  assert.equal(saved.ttsVoice, scenario.ttsVoice);
  assert.equal(saved.speechRate, scenario.speechRate);
  assert.equal(saved.assistantAvatarKey, scenario.assistantAvatarKey);
  assert.equal(saved.behaviorInstructions, scenario.behaviorInstructions);
});
