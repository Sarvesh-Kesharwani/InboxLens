import { NextResponse } from "next/server";
import { getFreshGmailToken, writeGmailToken } from "@/lib/gmail-oauth";

export async function GET() {
  const { token, refreshed } = await getFreshGmailToken();

  if (!token) {
    return NextResponse.json({ connected: false });
  }

  const response = NextResponse.json({
    connected: true,
    email: token.email,
    expiresAt: token.expiresAt,
  });

  if (refreshed) {
    writeGmailToken(response, token);
  }

  return response;
}
