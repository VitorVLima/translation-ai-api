import { API_URL } from '../../config/api';
import type {
  GoogleLoginRequest,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  RefreshRequest,
  RegisterRequest,
  ResendEmailVerificationRequest,
  ResetPasswordRequest,
  ValidatePasswordResetCodeRequest,
  TokenPairResponse,
  UserResponse,
  VerifyEmailRequest,
} from './auth.types';

export type LoginErrorKind = 'network' | 'invalidCredentials' | 'emailUnverified' | 'rateLimit' | 'validation' | 'unexpected';

export class LoginError extends Error {
  constructor(public readonly kind: LoginErrorKind) {
    super(kind);
    this.name = 'LoginError';
  }
}

function isUserResponse(value: unknown): value is UserResponse {
  if (!value || typeof value !== 'object') return false;
  const user = value as Partial<UserResponse>;
  return (
    typeof user.id === 'string' &&
    typeof user.email === 'string' &&
    (user.username === null || typeof user.username === 'string') &&
    typeof user.createdAt === 'string' &&
    (user.role === 'USER' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')
  );
}

function isTokenPairResponse(value: unknown): value is TokenPairResponse {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<TokenPairResponse>;
  return typeof result.accessToken === 'string' && result.accessToken.length > 0 &&
    typeof result.refreshToken === 'string' && result.refreshToken.length > 0;
}

export function isLoginResponse(value: unknown): value is LoginResponse {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<LoginResponse>;
  const user = result.user;
  return isTokenPairResponse(result) && isUserResponse(user);
}

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
  } catch {
    throw new LoginError('network');
  }

  if (response.status === 401) throw new LoginError('invalidCredentials');
  if (response.status === 403) throw new LoginError('emailUnverified');
  if (response.status === 429) throw new LoginError('rateLimit');
  if (response.status === 400) throw new LoginError('validation');
  if (response.status !== 200) throw new LoginError('unexpected');

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    // Inclui resposta 200 sem body ou JSON inválido.
    throw new LoginError('unexpected');
  }

  if (!isLoginResponse(result)) throw new LoginError('unexpected');
  return result;
}

export type RegisterErrorKind = 'network' | 'validation' | 'conflict' | 'rateLimit' | 'unexpected';

export class RegisterError extends Error {
  constructor(public readonly kind: RegisterErrorKind) {
    super(kind);
    this.name = 'RegisterError';
  }
}

export async function register(credentials: RegisterRequest): Promise<UserResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
  } catch {
    throw new RegisterError('network');
  }

  if (response.status === 400) throw new RegisterError('validation');
  if (response.status === 409) throw new RegisterError('conflict');
  if (response.status === 429) throw new RegisterError('rateLimit');
  if (response.status !== 201) throw new RegisterError('unexpected');

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new RegisterError('unexpected');
  }
  if (!isUserResponse(result)) throw new RegisterError('unexpected');
  return result;
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = Number(response.headers.get('Retry-After'));
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : undefined;
}

export type VerifyEmailErrorKind = 'network' | 'invalidCode' | 'rateLimit' | 'unexpected';

export class VerifyEmailError extends Error {
  constructor(
    public readonly kind: VerifyEmailErrorKind,
    public readonly retryAfterSeconds?: number,
  ) {
    super(kind);
    this.name = 'VerifyEmailError';
  }
}

export async function verifyEmail(request: VerifyEmailRequest): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    throw new VerifyEmailError('network');
  }

  if (response.status === 400) throw new VerifyEmailError('invalidCode');
  if (response.status === 429) throw new VerifyEmailError('rateLimit', retryAfterSeconds(response));
  if (response.status !== 204) throw new VerifyEmailError('unexpected');
}

export type ResendEmailVerificationErrorKind = 'network' | 'validation' | 'rateLimit' | 'unexpected';

export class ResendEmailVerificationError extends Error {
  constructor(
    public readonly kind: ResendEmailVerificationErrorKind,
    public readonly retryAfterSeconds?: number,
  ) {
    super(kind);
    this.name = 'ResendEmailVerificationError';
  }
}

export async function resendEmailVerification(request: ResendEmailVerificationRequest): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    throw new ResendEmailVerificationError('network');
  }

  if (response.status === 400) throw new ResendEmailVerificationError('validation');
  if (response.status === 429) {
    throw new ResendEmailVerificationError('rateLimit', retryAfterSeconds(response));
  }
  if (response.status !== 204) throw new ResendEmailVerificationError('unexpected');
}

export type PasswordResetErrorKind = 'network' | 'validation' | 'invalidCode' | 'rateLimit' | 'unexpected';

export class PasswordResetError extends Error {
  constructor(
    public readonly kind: PasswordResetErrorKind,
    public readonly retryAfterSeconds?: number,
  ) {
    super(kind);
    this.name = 'PasswordResetError';
  }
}

type ValidationErrorBody = { errors?: Record<string, string> };

async function readValidationErrors(response: Response): Promise<Record<string, string>> {
  try {
    const body = await response.json() as ValidationErrorBody;
    return body.errors ?? {};
  } catch {
    return {};
  }
}

export async function requestPasswordReset(request: ForgotPasswordRequest): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    throw new PasswordResetError('network');
  }

  if (response.status === 400) throw new PasswordResetError('validation');
  if (response.status === 429) throw new PasswordResetError('rateLimit', retryAfterSeconds(response));
  if (response.status !== 204) throw new PasswordResetError('unexpected');
}

export async function resetPassword(request: ResetPasswordRequest): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    throw new PasswordResetError('network');
  }

  if (response.status === 400) {
    const errors = await readValidationErrors(response);
    if (errors.email || errors.code || errors.newPassword) throw new PasswordResetError('validation');
    throw new PasswordResetError('invalidCode');
  }
  if (response.status === 429) throw new PasswordResetError('rateLimit', retryAfterSeconds(response));
  if (response.status !== 204) throw new PasswordResetError('unexpected');
}

export async function validatePasswordResetCode(request: ValidatePasswordResetCodeRequest): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/auth/validate-reset-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    throw new PasswordResetError('network');
  }

  if (response.status === 400) throw new PasswordResetError('invalidCode');
  if (response.status === 429) throw new PasswordResetError('rateLimit', retryAfterSeconds(response));
  if (response.status !== 204) throw new PasswordResetError('unexpected');
}

export type GoogleLoginErrorKind = 'network' | 'invalid' | 'conflict' | 'rateLimit' | 'unexpected';

export class GoogleLoginError extends Error {
  constructor(public readonly kind: GoogleLoginErrorKind) {
    super(kind);
    this.name = 'GoogleLoginError';
  }
}

export class GoogleNonceError extends Error {
  constructor() {
    super('google-nonce-unavailable');
    this.name = 'GoogleNonceError';
  }
}

export async function requestGoogleNonce(): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/auth/google/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    throw new GoogleNonceError();
  }

  if (response.status !== 200) throw new GoogleNonceError();
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new GoogleNonceError();
  }
  if (!result || typeof result !== 'object' || typeof (result as { nonce?: unknown }).nonce !== 'string') {
    throw new GoogleNonceError();
  }
  const nonce = (result as { nonce: string }).nonce.trim();
  if (!nonce) throw new GoogleNonceError();
  return nonce;
}

export async function loginWithGoogle(credentials: GoogleLoginRequest): Promise<LoginResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
  } catch {
    throw new GoogleLoginError('network');
  }

  if (response.status === 401) throw new GoogleLoginError('invalid');
  if (response.status === 409) throw new GoogleLoginError('conflict');
  if (response.status === 429) throw new GoogleLoginError('rateLimit');
  if (response.status !== 200) throw new GoogleLoginError('unexpected');

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new GoogleLoginError('unexpected');
  }
  if (!isLoginResponse(result)) throw new GoogleLoginError('unexpected');
  return result;
}

export type RefreshErrorKind = 'invalid' | 'network' | 'rateLimit' | 'unexpected' | 'invalidResponse';

export class RefreshError extends Error {
  constructor(public readonly kind: RefreshErrorKind) {
    super(kind);
    this.name = 'RefreshError';
  }
}

function traceAuth(event: string, details: Record<string, number | string>): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.info(`[AUTH] ${event}`, details);
  }
}

export async function refreshSession(request: RefreshRequest): Promise<TokenPairResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    traceAuth('refresh-network-error', { kind: 'network' });
    throw new RefreshError('network');
  }

  traceAuth('refresh-response', { status: response.status });

  if (response.status === 401) throw new RefreshError('invalid');
  if (response.status === 429) throw new RefreshError('rateLimit');
  if (response.status !== 200) throw new RefreshError('unexpected');

  let body: string;
  try {
    body = await response.text();
  } catch {
    // A conexão também pode cair depois dos headers, durante a leitura do body.
    throw new RefreshError('network');
  }
  let result: unknown;
  try {
    result = JSON.parse(body);
  } catch {
    throw new RefreshError('invalidResponse');
  }
  if (!isTokenPairResponse(result)) throw new RefreshError('invalidResponse');
  return result;
}

export type CurrentUserErrorKind = 'unauthorized' | 'network' | 'unexpected';

export class CurrentUserError extends Error {
  constructor(public readonly kind: CurrentUserErrorKind) {
    super(kind);
    this.name = 'CurrentUserError';
  }
}

export async function getCurrentUser(accessToken: string): Promise<UserResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new CurrentUserError('network');
  }

  if (response.status === 401) throw new CurrentUserError('unauthorized');
  if (response.status !== 200) throw new CurrentUserError('unexpected');

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new CurrentUserError('unexpected');
  }
  if (!isUserResponse(result)) throw new CurrentUserError('unexpected');
  return result;
}

export async function logout(refreshToken: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) throw new Error('logout-failed');
}
