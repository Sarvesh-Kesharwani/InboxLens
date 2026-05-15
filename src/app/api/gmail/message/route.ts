import { NextResponse } from "next/server";
import { getFreshGmailToken, writeGmailToken } from "@/lib/gmail-oauth";

type GmailPart = {
  mimeType?: string;
  body?: {
    data?: string;
  };
  parts?: GmailPart[];
};

type GmailMessageDetail = GmailPart & {
  id?: string;
  snippet?: string;
  payload?: GmailPart;
  error?: {
    message?: string;
  };
};

function decodeBase64Url(data: string) {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function collectBody(part?: GmailPart): { plain: string[]; html: string[] } {
  if (!part) return { plain: [], html: [] };

  const plain: string[] = [];
  const html: string[] = [];

  if (part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    if (part.mimeType === "text/plain") {
      plain.push(decoded);
    } else if (part.mimeType === "text/html") {
      html.push(stripHtml(decoded));
    }
  }

  for (const child of part.parts ?? []) {
    const nested = collectBody(child);
    plain.push(...nested.plain);
    html.push(...nested.html);
  }

  return { plain, html };
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing Gmail message id." }, { status: 400 });
  }

  const { token, refreshed } = await getFreshGmailToken();
  if (!token) {
    return NextResponse.json({ error: "Connect Gmail before loading full messages." }, { status: 401 });
  }

  const detailUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
  detailUrl.searchParams.set("format", "full");

  const detailResponse = await fetch(detailUrl, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });
  const detail = (await detailResponse.json()) as GmailMessageDetail;

  if (!detailResponse.ok) {
    return NextResponse.json({ error: detail.error?.message ?? "Could not load the full Gmail message." }, { status: 502 });
  }

  const body = collectBody(detail.payload);
  const text = [...body.plain, ...body.html].join("\n\n").trim() || detail.snippet || "No readable body returned for this message.";
  const response = NextResponse.json({ id, bodyText: text });

  if (refreshed) {
    writeGmailToken(response, token);
  }

  return response;
}
