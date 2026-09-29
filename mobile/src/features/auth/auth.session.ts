import type { LoginResponse, UserResponse } from './auth.types';
import { CurrentUserError, getCurrentUser, RefreshError, refreshSession } from './auth.service';
import { getRefreshToken, removeRefreshToken, saveRefreshToken } from './refresh-token.storage';

export type AuthenticatedSession = {
  user: UserResponse;
  accessToken: string;
};

let currentSession: AuthenticatedSession | null = null;
let restorationPromise: Promise<RestorationResult> | null = null;

export type RestorationResult =
  | { status: 'authenticated'; session: AuthenticatedSession }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

export function getSession(): AuthenticatedSession | null {
  return currentSession;
}

async function removeRefreshTokenIfPossible(): Promise<void> {
  try {
    await removeRefreshToken();
  } catch {
    // Sem sessão em memória; o armazenamento pode estar temporariamente indisponível.
  }
}

export async function establishSession(response: LoginResponse): Promise<void> {
  currentSession = null;
  try {
    await saveRefreshToken(response.refreshToken);
  } catch {
    await removeRefreshTokenIfPossible();
    throw new Error('Secure session unavailable');
  }

  currentSession = { user: response.user, accessToken: response.accessToken };
}

async function restoreSessionOnce(): Promise<RestorationResult> {
  currentSession = null;

  let storedToken: string | null;
  try {
    storedToken = await getRefreshToken();
  } catch {
    return { status: 'unavailable' };
  }

  if (storedToken === null) return { status: 'unauthenticated' };
  if (!storedToken.trim()) {
    await removeRefreshTokenIfPossible();
    return { status: 'unauthenticated' };
  }

  let tokens;
  try {
    tokens = await refreshSession({ refreshToken: storedToken });
  } catch (error) {
    if (error instanceof RefreshError && error.kind === 'invalid') {
      await removeRefreshTokenIfPossible();
      return { status: 'unauthenticated' };
    }
    if (error instanceof RefreshError && error.kind === 'invalidResponse') {
      // Um 200 pode já ter rotacionado o token antigo, mesmo sem resposta utilizável.
      await removeRefreshTokenIfPossible();
    }
    return { status: 'unavailable' };
  }

  try {
    await saveRefreshToken(tokens.refreshToken);
  } catch {
    // O Backend já rotacionou: não reutilizar o token antigo.
    await removeRefreshTokenIfPossible();
    return { status: 'unavailable' };
  }

  try {
    const user = await getCurrentUser(tokens.accessToken);
    currentSession = { user, accessToken: tokens.accessToken };
    return { status: 'authenticated', session: currentSession };
  } catch (error) {
    if (error instanceof CurrentUserError && error.kind === 'unauthorized') {
      await removeRefreshTokenIfPossible();
      return { status: 'unauthenticated' };
    }
    // Falha de rede ou servidor em /me: manter somente o novo refresh token.
    return { status: 'unavailable' };
  }
}

export function restoreSession(): Promise<RestorationResult> {
  // O efeito pode rodar duas vezes em desenvolvimento; a rotação deve ocorrer uma vez.
  if (!restorationPromise) {
    restorationPromise = restoreSessionOnce().finally(() => {
      restorationPromise = null;
    });
  }
  return restorationPromise;
}
