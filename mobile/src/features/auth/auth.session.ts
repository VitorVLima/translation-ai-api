import type { LoginResponse, UserResponse } from './auth.types';
import { CurrentUserError, getCurrentUser, RefreshError, refreshSession } from './auth.service';
import { getRefreshToken, removeRefreshToken, saveRefreshToken } from './refresh-token.storage';

export type AuthenticatedSession = {
  user: UserResponse;
  accessToken: string;
  revision: number;
};

let currentSession: AuthenticatedSession | null = null;
let restorationPromise: Promise<RestorationResult> | null = null;
let refreshPromise: Promise<string> | null = null;
let cleanupPromise: Promise<void> | null = null;
const invalidationListeners = new Set<() => void>();

export type SessionErrorKind = 'invalid' | 'network' | 'rateLimit' | 'unavailable' | 'storage' | 'changed';

export class SessionError extends Error {
  constructor(public readonly kind: SessionErrorKind) {
    super(kind);
    this.name = 'SessionError';
  }
}

export type RestorationResult =
  | { status: 'authenticated'; session: AuthenticatedSession }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

export function getSession(): AuthenticatedSession | null {
  return currentSession;
}

export function subscribeToSessionInvalidation(listener: () => void): () => void {
  invalidationListeners.add(listener);
  return () => { invalidationListeners.delete(listener); };
}

async function removeRefreshTokenIfPossible(): Promise<void> {
  try {
    await removeRefreshToken();
  } catch {
    // Sem sessão em memória; o armazenamento pode estar temporariamente indisponível.
  }
}

export async function invalidateSession(expectedSession: AuthenticatedSession | null): Promise<void> {
  // Uma resposta atrasada não pode encerrar uma sessão criada por outro login.
  if (currentSession !== expectedSession) return;
  currentSession = null;
  const cleanup = removeRefreshTokenIfPossible();
  cleanupPromise = cleanup;
  await cleanup;
  if (cleanupPromise === cleanup) cleanupPromise = null;
  if (expectedSession && currentSession === null) {
    invalidationListeners.forEach((listener) => listener());
  }
}

export async function establishSession(response: LoginResponse): Promise<void> {
  // Não sobrescrever o SecureStore enquanto uma rotação/limpeza antiga ainda termina.
  await refreshPromise?.catch(() => {});
  await cleanupPromise;
  currentSession = null;
  try {
    await saveRefreshToken(response.refreshToken);
  } catch {
    await removeRefreshTokenIfPossible();
    throw new SessionError('storage');
  }

  refreshPromise = null;
  currentSession = { user: response.user, accessToken: response.accessToken, revision: 0 };
}

async function rotateTokensOnce(): Promise<string> {
  const owner = currentSession;
  let storedToken: string | null;
  try {
    storedToken = await getRefreshToken();
  } catch {
    throw new SessionError('storage');
  }

  if (!storedToken?.trim()) {
    await invalidateSession(owner);
    throw new SessionError('invalid');
  }

  let tokens;
  try {
    tokens = await refreshSession({ refreshToken: storedToken });
  } catch (error) {
    if (error instanceof RefreshError && error.kind === 'invalid') {
      await invalidateSession(owner);
      throw new SessionError('invalid');
    }
    if (error instanceof RefreshError && error.kind === 'invalidResponse') {
      // Um 200 pode já ter rotacionado o token antigo, mesmo sem resposta utilizável.
      await invalidateSession(owner);
    }
    if (error instanceof RefreshError && (error.kind === 'network' || error.kind === 'rateLimit')) {
      throw new SessionError(error.kind);
    }
    throw new SessionError('unavailable');
  }

  if (currentSession !== owner) throw new SessionError('changed');
  try {
    await saveRefreshToken(tokens.refreshToken);
  } catch {
    // O Backend já rotacionou: não reutilizar o token antigo.
    await invalidateSession(owner);
    throw new SessionError('storage');
  }
  if (currentSession !== owner) {
    await removeRefreshTokenIfPossible();
    throw new SessionError('changed');
  }
  if (owner) {
    owner.accessToken = tokens.accessToken;
    // O Backend pode gerar JWTs iguais no mesmo segundo. Comparar só strings não basta.
    owner.revision += 1;
  }
  return tokens.accessToken;
}

function rotateTokens(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = rotateTokensOnce().then((accessToken) => {
      refreshPromise = null;
      return accessToken;
    });
    // Em falha, manter a Promise rejeitada até novo login/reinício. Isso impede
    // que outros 401 repitam automaticamente uma rotação de resultado ambíguo.
  }
  return refreshPromise;
}

export async function renewSession(session: AuthenticatedSession, rejectedRevision: number): Promise<void> {
  if (currentSession !== session) throw new SessionError('changed');
  if (session.revision !== rejectedRevision) return;
  await rotateTokens();
  if (currentSession !== session) throw new SessionError('changed');
}

async function restoreSessionOnce(): Promise<RestorationResult> {
  try {
    const accessToken = await rotateTokens();
    // Chamada direta: falhar aqui não deve iniciar uma segunda rotação no startup.
    const user = await getCurrentUser(accessToken);
    currentSession = { user, accessToken, revision: 0 };
    return { status: 'authenticated', session: currentSession };
  } catch (error) {
    if (error instanceof SessionError && error.kind === 'invalid') {
      return { status: 'unauthenticated' };
    }
    if (error instanceof CurrentUserError && error.kind === 'unauthorized') {
      await invalidateSession(null);
      return { status: 'unauthenticated' };
    }
    // Falha de rede ou servidor em /me: manter somente o novo refresh token.
    return { status: 'unavailable' };
  }
}

export function restoreSession(): Promise<RestorationResult> {
  if (currentSession) return Promise.resolve({ status: 'authenticated', session: currentSession });
  // O efeito pode rodar duas vezes em desenvolvimento; a rotação deve ocorrer uma vez.
  if (!restorationPromise) {
    restorationPromise = restoreSessionOnce().finally(() => {
      restorationPromise = null;
    });
  }
  return restorationPromise;
}
