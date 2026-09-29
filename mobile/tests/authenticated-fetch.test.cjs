const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const user = { id: 'test-user', email: 'user@example.test', username: 'Test', createdAt: '2026-01-01', role: 'USER' };
const pair = { accessToken: 'test-access-next', refreshToken: 'test-refresh-next' };
const json = (value) => new Response(JSON.stringify(value), { status: 200 });
const status = (code) => new Response(null, { status: code });
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

// Executa os módulos reais em memória. Somente rede, configuração e SecureStore
// são substituídos; usa node:test e o TypeScript que o projeto já possui.
function harness(handleRequest) {
  const state = { token: 'test-refresh-initial', refreshes: 0, requests: 0, removals: 0, failSave: false };
  const secureStore = {
    getItemAsync: async () => state.token,
    setItemAsync: async (_key, value) => {
      if (state.saveGate) await state.saveGate.promise;
      if (state.failSave) throw new Error('Storage unavailable');
      state.token = value;
    },
    deleteItemAsync: async () => { state.removals++; state.token = null; },
  };
  const context = vm.createContext({ URL, Headers, fetch: async (url, options) => {
    const isRefresh = new URL(url).pathname === '/api/v1/auth/refresh';
    if (isRefresh) state.refreshes++; else state.requests++;
    return handleRequest({ url, options, isRefresh, state });
  } });
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const execute = vm.runInContext(`(function(require, module, exports) {${output}\n})`, context, { filename: file });
    execute((name) => {
      if (name === 'expo-secure-store') return secureStore;
      if (name.endsWith('/config/api')) return { API_URL: 'https://api.example.test' };
      return load(path.resolve(path.dirname(file), `${name}.ts`));
    }, module, module.exports);
    return module.exports;
  }
  const session = load(path.resolve(__dirname, '../src/features/auth/auth.session.ts'));
  const { authenticatedFetch } = load(path.resolve(__dirname, '../src/api/authenticated-fetch.ts'));
  const login = () => session.establishSession({ user, accessToken: 'test-access-initial', refreshToken: 'test-refresh-initial' });
  return { state, session, request: authenticatedFetch, login };
}

test('200/403/429 de request protegida retornam sem refresh; Bearer vem da sessão', async () => {
  for (const code of [200, 403, 429]) {
    const h = harness(({ options }) => {
      assert.equal(options.headers.get('Authorization'), 'Bearer test-access-initial');
      assert.equal(options.headers.get('Accept'), 'application/json');
      return status(code);
    });
    await h.login();
    const response = await h.request('/api/v1/users/me', { headers: { Accept: 'application/json', Authorization: 'ignored' } });
    assert.equal(response.status, code);
    assert.equal(h.state.refreshes, 0);
  }
});

test('três 401 compartilham refresh e só repetem após persistir a rotação', async () => {
  const started = deferred();
  const finishRefresh = deferred();
  const saveGate = deferred();
  const h = harness(async ({ options, isRefresh }) => {
    if (isRefresh) { started.resolve(); await finishRefresh.promise; return json(pair); }
    return options.headers.get('Authorization') === `Bearer ${pair.accessToken}` ? status(200) : status(401);
  });
  await h.login();
  const originalUser = h.session.getSession().user;
  h.state.saveGate = saveGate;
  const requests = Array.from({ length: 3 }, () => h.request('/api/v1/users/me'));
  await started.promise;
  assert.equal(h.state.refreshes, 1);
  finishRefresh.resolve();
  await new Promise(setImmediate);
  assert.equal(h.state.requests, 3);
  assert.equal(h.session.getSession().revision, 0);
  saveGate.resolve();
  const responses = await Promise.all(requests);
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(h.state.requests, 6);
  assert.equal(h.state.refreshes, 1);
  assert.equal(h.state.token, pair.refreshToken);
  assert.equal(h.session.getSession().user, originalUser);
  assert.equal(h.session.getSession().revision, 1);
});

test('401 atrasado não renova outra vez, mesmo quando o JWT novo é igual', async () => {
  const late = deferred();
  const counts = new Map();
  const h = harness(({ url, isRefresh }) => {
    if (isRefresh) return json({ ...pair, accessToken: 'test-access-initial' });
    const count = (counts.get(url) || 0) + 1;
    counts.set(url, count);
    if (count > 1) return status(200);
    return url.endsWith('?late') ? late.promise : status(401);
  });
  await h.login();
  const first = h.request('/api/v1/users/me');
  const second = h.request('/api/v1/users/me?late');
  await first;
  late.resolve(status(401));
  assert.equal((await second).status, 200);
  assert.equal(h.state.refreshes, 1);
});

test('próxima expiração usa o refresh rotacionado, sem reutilizar o anterior', async () => {
  const h = harness(({ isRefresh, options, state }) => {
    if (isRefresh) {
      assert.equal(JSON.parse(options.body).refreshToken,
        state.refreshes === 1 ? 'test-refresh-initial' : pair.refreshToken);
      return json({ ...pair, refreshToken: state.refreshes === 1 ? pair.refreshToken : 'test-refresh-final' });
    }
    return status(state.requests % 2 === 1 ? 401 : 200);
  });
  await h.login();
  assert.equal((await h.request('/api/v1/users/me')).status, 200);
  assert.equal((await h.request('/api/v1/users/me')).status, 200);
  assert.equal(h.state.refreshes, 2);
  assert.equal(h.session.getSession().revision, 2);
  assert.equal(h.state.token, 'test-refresh-final');
});

test('refresh 401 limpa sessão/token e notifica App uma vez', async () => {
  const h = harness(() => status(401));
  await h.login();
  let notifications = 0;
  h.session.subscribeToSessionInvalidation(() => { notifications++; });
  const results = await Promise.allSettled([h.request('/api/v1/users/me'), h.request('/api/v1/users/me')]);
  assert.ok(results.every((result) => result.status === 'rejected' && result.reason.kind === 'invalid'));
  assert.equal(h.state.refreshes, 1);
  assert.equal(h.state.requests, 2);
  assert.equal(h.state.token, null);
  assert.equal(h.session.getSession(), null);
  assert.equal(notifications, 1);
});

for (const failure of ['network', 429, 503]) {
  test(`refresh ${failure} preserva credencial e bloqueia repetição automática`, async () => {
    const h = harness(({ isRefresh }) => {
      if (!isRefresh) return status(401);
      if (failure === 'network') throw new Error('Connection lost');
      return status(failure);
    });
    await h.login();
    const originalSession = h.session.getSession();
    const kind = failure === 'network' ? 'network' : failure === 429 ? 'rateLimit' : 'unavailable';
    await Promise.all([
      assert.rejects(h.request('/api/v1/users/me'), (error) => error.kind === kind),
      assert.rejects(h.request('/api/v1/users/me'), (error) => error.kind === kind),
    ]);
    await assert.rejects(h.request('/api/v1/users/me'), (error) => error.kind === kind);
    assert.equal(h.state.refreshes, 1);
    assert.equal(h.state.token, 'test-refresh-initial');
    assert.equal(h.session.getSession(), originalSession);
  });
}

test('401 no retry encerra a operação sem loop', async () => {
  const h = harness(({ isRefresh }) => isRefresh ? json(pair) : status(401));
  await h.login();
  await assert.rejects(h.request('/api/v1/users/me'), (error) => error.kind === 'invalid');
  assert.equal(h.state.refreshes, 1);
  assert.equal(h.state.requests, 2);
  assert.equal(h.session.getSession(), null);
  assert.equal(h.state.token, null);
});

test('falha ao salvar token rotacionado limpa memória e não repete request', async () => {
  const h = harness(({ isRefresh }) => isRefresh ? json(pair) : status(401));
  await h.login();
  h.state.failSave = true;
  await assert.rejects(h.request('/api/v1/users/me'), (error) => error.kind === 'storage');
  assert.equal(h.state.requests, 1);
  assert.equal(h.state.removals, 1);
  assert.equal(h.state.token, null);
  assert.equal(h.session.getSession(), null);
});

test('perda do body do refresh é rede: preserva token e impede novo POST automático', async () => {
  const h = harness(({ isRefresh }) => isRefresh
    ? { status: 200, text: async () => { throw new Error('Connection lost'); } }
    : status(401));
  await h.login();
  await assert.rejects(h.request('/api/v1/users/me'), (error) => error.kind === 'network');
  await assert.rejects(h.request('/api/v1/users/me'), (error) => error.kind === 'network');
  assert.equal(h.state.refreshes, 1);
  assert.equal(h.state.token, 'test-refresh-initial');
  assert.ok(h.session.getSession());
});

test('refresh 200 com contrato inválido não estabelece sessão parcial', async () => {
  const h = harness(({ isRefresh }) => isRefresh ? json({}) : status(401));
  await h.login();
  await assert.rejects(h.request('/api/v1/users/me'), (error) => error.kind === 'unavailable');
  assert.equal(h.state.requests, 1);
  assert.equal(h.state.token, null);
  assert.equal(h.session.getSession(), null);
});

test('novo login permite refresh novamente após falha anterior', async () => {
  const h = harness(({ isRefresh, options, state }) => {
    if (isRefresh && state.refreshes === 1) throw new Error('Connection lost');
    if (isRefresh) return json(pair);
    return options.headers.get('Authorization') === `Bearer ${pair.accessToken}` ? status(200) : status(401);
  });
  await h.login();
  await assert.rejects(h.request('/api/v1/users/me'), (error) => error.kind === 'network');
  await h.login();
  assert.equal((await h.request('/api/v1/users/me')).status, 200);
  assert.equal(h.state.refreshes, 2);
});

test('startup compartilha rotação e persiste antes de /me; efeitos duplicados não duplicam POST', async () => {
  const h = harness(({ isRefresh, state }) => {
    if (isRefresh) return json(pair);
    assert.equal(state.token, pair.refreshToken);
    return json(user);
  });
  const first = h.session.restoreSession();
  const second = h.session.restoreSession();
  assert.equal(first, second);
  assert.equal((await first).status, 'authenticated');
  assert.equal((await second).status, 'authenticated');
  assert.equal(h.state.refreshes, 1);
  assert.equal(h.state.requests, 1);
});

test('startup sem token vai ao Login sem request HTTP', async () => {
  const h = harness(() => { throw new Error('Unexpected request'); });
  h.state.token = null;
  assert.equal((await h.session.restoreSession()).status, 'unauthenticated');
  assert.equal(h.state.refreshes + h.state.requests, 0);
});

test('401 de sessão anterior não apaga credenciais de novo login', async () => {
  const pending = deferred();
  const h = harness(() => pending.promise);
  await h.login();
  const request = h.request('/api/v1/users/me');
  await h.login();
  pending.resolve(status(401));
  await assert.rejects(request, (error) => error.kind === 'changed');
  assert.ok(h.session.getSession());
  assert.equal(h.state.removals, 0);
  assert.equal(h.state.refreshes, 0);
});

test('sem sessão ou caminho público/externo não envia credencial nem faz refresh', async () => {
  const h = harness(() => { throw new Error('Unexpected request'); });
  await assert.rejects(h.request('/api/v1/users/me'), (error) => error.kind === 'invalid');
  await h.login();
  for (const path of ['/api/v1/auth/login', '/api/v1/auth/refresh', 'https://elsewhere.example/api/v1/users/me']) {
    await assert.rejects(h.request(path));
  }
  assert.equal(h.state.requests + h.state.refreshes, 0);
});
