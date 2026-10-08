const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function loadAuthService(fetchImpl) {
  const context = vm.createContext({ fetch: fetchImpl, Response, URL, console, __DEV__: false });
  const module = { exports: {} };
  const output = ts.transpileModule(read('src/features/auth/auth.service.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const execute = vm.runInContext(`(function(require, module, exports) {${output}\n})`, context);
  execute((name) => name.endsWith('/config/api') ? { API_URL: 'https://api.example.test' } : (() => { throw new Error(`Unexpected import ${name}`); })(), module, module.exports);
  return module.exports;
}

const validUser = { id: 'user-id', email: 'user@example.test', username: 'learner', createdAt: '2026-01-01T00:00:00Z', role: 'USER' };
const registeredUser = { ...validUser, username: null };
const validLogin = { user: validUser, accessToken: 'access-token', refreshToken: 'refresh-token' };

test('Login mantém credenciais tradicionais, loading, senha visível e navegação para cadastro', () => {
  const source = read('src/features/auth/screens/LoginScreen.tsx');
  assert.match(source, /login\(\{ email: email\.trim\(\), password \}\)/);
  assert.match(source, /establishSession\(response\)/);
  assert.match(source, /submittingRef\.current/);
  assert.match(source, /showPassword/);
  assert.match(source, /Entrando\.\.\./);
  assert.match(source, /router\.push\('\/register'\)/);
  assert.match(source, /pathname: '\/verify-email'/);
  assert.match(source, /case 'emailUnverified':/);
  assert.match(source, /router\.push\('\/forgot-password'\)/);
  assert.match(source, /<GoogleSignInButton/);
});

test('recuperação de senha mantém fluxo independente, requisitos da senha e limpeza de estado sensível', () => {
  const source = read('src/features/auth/screens/PasswordRecoveryScreen.tsx');
  assert.match(source, /requestPasswordReset\(\{ email: normalizedEmail \}\)/);
  assert.match(source, /validatePasswordResetCode\(\{ email: pendingEmail, code \}\)/);
  assert.match(source, /resetPassword\(\{ email: pendingEmail, code, newPassword: password \}\)/);
  assert.match(source, /getPasswordError\(password\)/);
  assert.match(source, /<PasswordRequirements password=\{password\}/);
  assert.match(source, /<VerificationCodeInput/);
  assert.match(source, /phase === 'code'/);
  assert.match(source, /phase === 'password'/);
  assert.match(source, /password !== confirmation/);
  assert.match(source, /Reenviar código/);
  assert.match(source, /RESEND_COOLDOWN_SECONDS = 60/);
  assert.match(source, /<PublicAuthScreen/);
  assert.match(source, /setCode\(''\); setPassword\(''\); setConfirmation\(''\)/);
  assert.match(source, /router\.replace\('\/login'\)/);
  assert.doesNotMatch(source, /establishSession|accessToken|refreshToken/);
});

test('Cadastro sem Nome abre a verificação independente', () => {
  const source = read('src/features/auth/screens/RegisterScreen.tsx');
  assert.match(source, /register\(\{ email: email\.trim\(\), password \}\)/);
  assert.doesNotMatch(source, /Username|usernameError|setUsername/);
  assert.doesNotMatch(source, /Nome completo/);
  assert.match(source, /getPasswordError\(password\)/);
  assert.match(source, /<PasswordRequirements password=\{password\}/);
  assert.match(source, /Criar conta/);
  assert.match(source, /pathname: '\/verify-email'/);
  assert.match(source, /email: user\.email, sent: '1'/);
  assert.doesNotMatch(source, /Etapa 1|stepCircle|stepLine/);
  assert.doesNotMatch(source, /Alert\.alert/);
  assert.match(source, /<GoogleSignInButton/);
});

test('serviço de autenticação envia e valida login, cadastro, verificação e Google sem confiar em dados livres', async () => {
  const requests = [];
  const service = loadAuthService(async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/auth/login')) return new Response(JSON.stringify(validLogin), { status: 200 });
    if (url.endsWith('/auth/register')) return new Response(JSON.stringify(registeredUser), { status: 201 });
    if (url.endsWith('/auth/verify-email')) return new Response(null, { status: 204 });
    if (url.endsWith('/auth/resend-verification')) return new Response(null, { status: 204 });
    if (url.endsWith('/auth/forgot-password')) return new Response(null, { status: 204 });
    if (url.endsWith('/auth/validate-reset-code')) return new Response(null, { status: 204 });
    if (url.endsWith('/auth/reset-password')) return new Response(null, { status: 204 });
    if (url.endsWith('/auth/google/nonce')) return new Response(JSON.stringify({ nonce: 'server-nonce' }), { status: 200 });
    if (url.endsWith('/auth/google')) return new Response(JSON.stringify(validLogin), { status: 200 });
    throw new Error('unexpected endpoint');
  });

  assert.deepEqual(await service.login({ email: 'user@example.test', password: 'secret' }), validLogin);
  assert.deepEqual(await service.register({ email: 'user@example.test', password: 'secret' }), registeredUser);
  await service.verifyEmail({ email: 'user@example.test', code: '123456' });
  await service.resendEmailVerification({ email: 'user@example.test' });
  await service.requestPasswordReset({ email: 'user@example.test' });
  await service.validatePasswordResetCode({ email: 'user@example.test', code: '123456' });
  await service.resetPassword({ email: 'user@example.test', code: '123456', newPassword: 'new-secret' });
  assert.equal(await service.requestGoogleNonce(), 'server-nonce');
  assert.deepEqual(await service.loginWithGoogle({ credential: 'google-id-token', nonce: 'server-nonce' }), validLogin);

  const bodyFor = (endpoint) => JSON.parse(requests.find(({ url }) => url.endsWith(endpoint)).options.body);
  const loginBody = bodyFor('/auth/login');
  const registerBody = bodyFor('/auth/register');
  const verifyBody = bodyFor('/auth/verify-email');
  const resendBody = bodyFor('/auth/resend-verification');
  const forgotBody = bodyFor('/auth/forgot-password');
  const validateBody = bodyFor('/auth/validate-reset-code');
  const resetBody = bodyFor('/auth/reset-password');
  const googleBody = bodyFor('/auth/google');
  assert.deepEqual(loginBody, { email: 'user@example.test', password: 'secret' });
  assert.deepEqual(registerBody, { email: 'user@example.test', password: 'secret' });
  assert.deepEqual(verifyBody, { email: 'user@example.test', code: '123456' });
  assert.deepEqual(resendBody, { email: 'user@example.test' });
  assert.deepEqual(forgotBody, { email: 'user@example.test' });
  assert.deepEqual(validateBody, { email: 'user@example.test', code: '123456' });
  assert.deepEqual(resetBody, { email: 'user@example.test', code: '123456', newPassword: 'new-secret' });
  assert.deepEqual(googleBody, { credential: 'google-id-token', nonce: 'server-nonce' });
  assert.equal(Object.hasOwn(googleBody, 'email'), false);
  assert.equal(Object.hasOwn(googleBody, 'userId'), false);
});

test('verificação mapeia código inválido e respeita Retry-After no reenvio', async () => {
  const invalidCodeService = loadAuthService(async () => new Response(JSON.stringify({ message: 'ignored' }), { status: 400 }));
  await assert.rejects(
    invalidCodeService.verifyEmail({ email: 'user@example.test', code: '123456' }),
    (error) => error.kind === 'invalidCode',
  );
  await assert.rejects(
    invalidCodeService.validatePasswordResetCode({ email: 'user@example.test', code: '123456' }),
    (error) => error.kind === 'invalidCode',
  );

  const limitedResendService = loadAuthService(async () => new Response(null, { status: 429, headers: { 'Retry-After': '37' } }));
  await assert.rejects(
    limitedResendService.resendEmailVerification({ email: 'user@example.test' }),
    (error) => error.kind === 'rateLimit' && error.retryAfterSeconds === 37,
  );
  await assert.rejects(
    limitedResendService.validatePasswordResetCode({ email: 'user@example.test', code: '123456' }),
    (error) => error.kind === 'rateLimit' && error.retryAfterSeconds === 37,
  );
});

test('tela compartilhada de verificação usa os endpoints reais e o cooldown do fluxo existente', () => {
  const source = read('src/features/auth/screens/EmailVerificationScreen.tsx');
  assert.match(source, /verifyEmail\(\{ email, code \}\)/);
  assert.match(source, /resendEmailVerification\(\{ email \}\)/);
  assert.match(source, /DEV_AUTH_UI_RESEND_COOLDOWN_SECONDS = 60/);
  assert.match(source, /retryAfterSeconds/);
  assert.match(source, /<VerificationCodeInput/);
  assert.match(read('src/features/auth/components/VerificationCodeInput.tsx'), /length: 6/);
  assert.match(source, /Confirmar e-mail/);
  assert.match(source, /Voltar para o login/);
});

test('Google inválido, conflito e cancelamento continuam como estados explícitos', async () => {
  const service = loadAuthService(async (url) => {
    if (url.endsWith('/auth/google')) return new Response(JSON.stringify({ message: 'invalid' }), { status: 401 });
    return new Response(null, { status: 200 });
  });
  await assert.rejects(service.loginWithGoogle({ credential: 'invalid', nonce: 'nonce' }), (error) => error.kind === 'invalid');

  const googleSource = read('src/features/auth/components/GoogleSignInButton.tsx');
  assert.match(googleSource, /requestGoogleNonce\(\)/);
  assert.match(googleSource, /GoogleOneTapSignIn\.configure/);
  assert.match(googleSource, /CryptoDigestAlgorithm\.SHA256/);
  assert.match(googleSource, /presentExplicitSignIn\(\)/);
  assert.match(googleSource, /loginWithGoogle\(\{ credential, nonce: serverNonce \}\)/);
  assert.match(googleSource, /busyRef\.current/);
  assert.match(googleSource, /fail\('cancelled'\)/);
  assert.match(googleSource, /Entrar com Google/);
});
