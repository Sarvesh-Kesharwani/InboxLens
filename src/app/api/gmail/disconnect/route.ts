import { NextResponse } from "next/server";
import { clearGmailToken } from "@/lib/gmail-oauth";

export async function POST() {
  const response = NextResponse.json({ disconnected: true });
  clearGmailToken(response);
  return response;
}
