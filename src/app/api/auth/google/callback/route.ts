import { NextResponse } from "next/server";
import { exchangeCodeForToken, writeGmailToken } from "@/lib/gmail-oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state") ?? "/";
  const redirectTarget = new URL(state.startsWith("/") ? state : "/", url.origin);

  if (error) {
    redirectTarget.searchParams.set("gmail", "error");
    redirectTarget.searchParams.set("message", error);
    return NextResponse.redirect(redirectTarget);
  }

  if (!code) {
    redirectTarget.searchParams.set("gmail", "error");
    redirectTarget.searchParams.set("message", "missing_code");
    return NextResponse.redirect(redirectTarget);
  }

  try {
    const token = await exchangeCodeForToken(code, url.origin);
    const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });
    const profile = profileResponse.ok ? await profileResponse.json() : null;
    const response = NextResponse.redirect(new URL("/?gmail=connected", url.origin));
    writeGmailToken(response, { ...token, email: profile?.emailAddress });
    return response;
  } catch (err) {
    redirectTarget.searchParams.set("gmail", "error");
    redirectTarget.searchParams.set("message", err instanceof Error ? err.message : "oauth_failed");
    return NextResponse.redirect(redirectTarget);
  }
}
