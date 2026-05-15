import type { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_TOKEN_COOKIE = "inboxlens_gmail_token";

export type GmailToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  email?: string;
};

export function getOAuthConfig(origin?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    `${origin ?? process.env.APP_BASE_URL ?? "http://localhost:3000"}/api/auth/callback/google`;

  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret && redirectUri),
  };
}

export function createGoogleAuthUrl(state = "/", origin?: string) {
  const { clientId, redirectUri } = getOAuthConfig(origin);
  if (!clientId || !redirectUri) return null;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("scope", GMAIL_SCOPE);
  authUrl.searchParams.set("state", state);
  return authUrl.toString();
}

export async function exchangeCodeForToken(code: string, origin?: string): Promise<GmailToken> {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig(origin);
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth is not configured.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description ?? data.error ?? "Google token exchange failed.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Math.max(0, (data.expires_in ?? 3600) - 60) * 1000,
  };
}

export async function refreshToken(token: GmailToken): Promise<GmailToken> {
  const { clientId, clientSecret } = getOAuthConfig();
  if (!clientId || !clientSecret || !token.refreshToken) {
    throw new Error("Cannot refresh Gmail token. Reconnect Gmail.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description ?? data.error ?? "Google token refresh failed.");
  }

  return {
    ...token,
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(0, (data.expires_in ?? 3600) - 60) * 1000,
  };
}

export async function readGmailToken() {
  const cookieStore = await cookies();
  const value = cookieStore.get(GMAIL_TOKEN_COOKIE)?.value;
  if (!value) return null;

  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as GmailToken;
  } catch {
    return null;
  }
}

export function writeGmailToken(response: NextResponse, token: GmailToken) {
  response.cookies.set(GMAIL_TOKEN_COOKIE, Buffer.from(JSON.stringify(token)).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export function clearGmailToken(response: NextResponse) {
  response.cookies.set(GMAIL_TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}

export async function getFreshGmailToken() {
  const token = await readGmailToken();
  if (!token) return { token: null, refreshed: false };

  if (token.expiresAt > Date.now()) {
    return { token, refreshed: false };
  }

  const refreshed = await refreshToken(token);
  return { token: refreshed, refreshed: true };
}
