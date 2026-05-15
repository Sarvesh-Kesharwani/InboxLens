import { NextResponse } from "next/server";
import { createGoogleAuthUrl, getOAuthConfig, GMAIL_SCOPE } from "@/lib/gmail-oauth";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const config = getOAuthConfig(origin);
  const authUrl = createGoogleAuthUrl("/", origin);

  if (!config.configured || !authUrl) {
    return NextResponse.json(
      {
        configured: false,
        scope: GMAIL_SCOPE,
        missing: {
          GOOGLE_CLIENT_ID: !config.clientId,
          GOOGLE_CLIENT_SECRET: !config.clientSecret,
          GOOGLE_REDIRECT_URI: false,
        },
        redirectUri: config.redirectUri,
        message:
          "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local, add this redirect URI in Google Cloud, then restart the dev server.",
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ configured: true, scope: GMAIL_SCOPE, redirectUri: config.redirectUri, authUrl });
}
