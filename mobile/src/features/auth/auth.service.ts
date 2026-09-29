import { API_URL } from '../../config/api';
import type { LoginRequest, LoginResponse, RefreshRequest, TokenPairResponse, UserResponse } from './auth.types';

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
    typeof user.username === 'string' &&
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

function isLoginResponse(value: unknown): value is LoginResponse {
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

export type RefreshErrorKind = 'invalid' | 'network' | 'rateLimit' | 'unexpected' | 'invalidResponse';

export class RefreshError extends Error {
  constructor(public readonly kind: RefreshErrorKind) {
    super(kind);
    this.name = 'RefreshError';
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
    throw new RefreshError('network');
  }

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
