import { headers } from 'next/headers';

export type SiteUser = { email: string; displayName: string };

export async function getSiteUser(): Promise<SiteUser | null> {
  const h = await headers();
  const email = h.get('oai-authenticated-user-email');
  if (!email) return null;
  const encoded = h.get('oai-authenticated-user-full-name');
  const encoding = h.get('oai-authenticated-user-full-name-encoding');
  let fullName: string | null = null;
  if (encoded) {
    try { fullName = encoding === 'percent-encoded-utf-8' ? decodeURIComponent(encoded) : encoded; } catch { fullName = null; }
  }
  return { email, displayName: fullName?.trim() || email };
}

export async function requireApiUser(): Promise<SiteUser> {
  const user = await getSiteUser();
  if (!user) throw new Error('AUTH_REQUIRED');
  return user;
}

export function unauthorized(): Response {
  return Response.json({ error: 'Sign in with ChatGPT is required.' }, { status: 401 });
}
