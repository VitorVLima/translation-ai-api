import { API_URL } from '../config/api';
import { fetch as expoFetch } from 'expo/fetch';
import { getSession, invalidateSession, renewSession, SessionError } from '../features/auth/auth.session';

// Requests can carry JSON or multipart FormData. Callers must not set the multipart boundary.
type AuthenticatedRequestOptions = RequestInit;

function traceAuth(event: string, details: Record<string, string | number | boolean>): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.info(`[AUTH] ${event}`, details);
  }
}

export async function authenticatedFetch(path: string, options: AuthenticatedRequestOptions = {}): Promise<Response> {
  const url = new URL(path, `${API_URL}/`);
  if (!path.startsWith('/api/v1/') || url.origin !== new URL(API_URL).origin ||
      !url.pathname.startsWith('/api/v1/') || /^\/api\/v1\/auth(?:\/|$)/.test(url.pathname)) {
    throw new Error('Expected a protected API path');
  }

  const session = getSession();
  if (!session) throw new SessionError('invalid');
  const sentRevision = session.revision;
  const requestOptions = { ...options, headers: new Headers(options.headers) };

  async function send(accessToken: string, attempt: 'initial' | 'retry'): Promise<Response> {
    const headers = new Headers(requestOptions.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    traceAuth('request', {
      attempt,
      method: requestOptions.method ?? 'GET',
      path: url.pathname,
    });
    if (url.pathname === '/api/v1/transcriptions') {
      traceAuth('transcription-before-fetch', {
        path: url.pathname,
        method: requestOptions.method ?? 'GET',
        bodyType: requestOptions.body?.constructor?.name ?? typeof requestOptions.body,
        attempt,
      });
    }
    try {
      const response = await expoFetch(url.toString(), { ...requestOptions, headers });
      traceAuth('response', { attempt, path: url.pathname, status: response.status });
      return response;
    } catch {
      traceAuth('network-error', { attempt, path: url.pathname });
      if (url.pathname === '/api/v1/transcriptions') {
        traceAuth('transcription-fetch-error', { attempt, path: url.pathname });
      }
      throw new SessionError('network');
    }
  }

  const response = await send(session.accessToken, 'initial');
  if (getSession() !== session) throw new SessionError('changed');
  if (response.status !== 401) return response;

  traceAuth('refresh-start', { path: url.pathname });
  try {
    await renewSession(session, sentRevision);
    traceAuth('refresh-complete', { path: url.pathname });
  } catch (error) {
    traceAuth('refresh-failed', {
      kind: error instanceof SessionError ? error.kind : 'unknown',
      path: url.pathname,
    });
    throw error;
  }
  const retryRevision = session.revision;
  const retryResponse = await send(session.accessToken, 'retry');
  if (getSession() !== session) throw new SessionError('changed');
  if (retryResponse.status === 401) {
    if (session.revision === retryRevision) await invalidateSession(session, `retry-401:${url.pathname}`);
    throw new SessionError('invalid');
  }
  return retryResponse;
}
