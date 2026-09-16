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
  const sandbox = { document: { getElementById: element, querySelectorAll: () => [], createElement: () => ({}), head: { appendChild() {} } },
    window: { confirm: () => true }, sessionStorage: { getItem: () => null }, FormData,
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
  return { run, calls, element, sandbox };
}

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
