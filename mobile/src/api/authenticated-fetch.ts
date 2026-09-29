import { API_URL } from '../config/api';
import { getSession, invalidateSession, renewSession, SessionError } from '../features/auth/auth.session';

// Somente bodies textuais/JSON reutilizáveis neste incremento; sem streams ou uploads.
type AuthenticatedRequestOptions = Omit<RequestInit, 'body'> & { body?: string };

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

  async function send(accessToken: string): Promise<Response> {
    const headers = new Headers(requestOptions.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    try {
      return await fetch(url.toString(), { ...requestOptions, headers });
    } catch {
      throw new SessionError('network');
    }
  }

  const response = await send(session.accessToken);
  if (getSession() !== session) throw new SessionError('changed');
  if (response.status !== 401) return response;

  await renewSession(session, sentRevision);
  const retryRevision = session.revision;
  const retryResponse = await send(session.accessToken);
  if (getSession() !== session) throw new SessionError('changed');
  if (retryResponse.status === 401) {
    if (session.revision === retryRevision) await invalidateSession(session);
    throw new SessionError('invalid');
  }
  return retryResponse;
}
