import { NextResponse } from "next/server";
import { classifyMail } from "@/lib/classifier";
import { sampleEmails } from "@/lib/data";
import { getFreshGmailToken, writeGmailToken } from "@/lib/gmail-oauth";
import type { MailItem } from "@/lib/types";

export const maxDuration = 60;

type GmailHeader = {
  name: string;
  value: string;
};

type GmailMessage = {
  id: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: {
    headers?: GmailHeader[];
  };
};

type SyncRequest = {
  pageToken?: string;
  maxResults?: number;
  query?: string;
};

type GmailListResponse = {
  messages?: Array<{ id: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
  error?: {
    message?: string;
  };
};

const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 500;
const DETAIL_CONCURRENCY = 25;

function headerValue(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseSender(value: string) {
  const match = value.match(/^(?:"?([^"<]+)"?\s*)?<([^>]+)>$/);
  if (!match) {
    return { sender: value || "Unknown sender", email: value || "unknown@example.com" };
  }

  return {
    sender: (match[1] ?? match[2]).trim(),
    email: match[2].trim(),
  };
}

function formatGmailDate(value?: string) {
  if (!value) return "Unknown";
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = [];

  for (let index = 0; index < items.length; index += limit) {
    const chunk = items.slice(index, index + limit);
    results.push(...(await Promise.all(chunk.map(mapper))));
  }

  return results;
}

function normalizeBatchSize(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(parsed)));
}

async function parseSyncRequest(request: Request): Promise<SyncRequest> {
  const raw = await request.text();
  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw) as SyncRequest;
  } catch {
    return {};
  }
}

async function fetchGmailMessages(
  accessToken: string,
  options: SyncRequest,
): Promise<{ messages: MailItem[]; total: number; nextPageToken?: string; batchSize: number }> {
  const batchSize = normalizeBatchSize(options.maxResults);
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("maxResults", String(batchSize));
  listUrl.searchParams.set("includeSpamTrash", "false");

  if (options.pageToken) {
    listUrl.searchParams.set("pageToken", options.pageToken);
  }

  if (options.query?.trim()) {
    listUrl.searchParams.set("q", options.query.trim());
  }

  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const listData = (await listResponse.json()) as GmailListResponse;

  if (!listResponse.ok) {
    throw new Error(listData.error?.message ?? "Could not list Gmail messages.");
  }

  const messageRefs = listData.messages ?? [];
  const messages = await mapWithConcurrency(messageRefs, DETAIL_CONCURRENCY, async (messageRef) => {
      const detailUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageRef.id}`);
      detailUrl.searchParams.set("format", "metadata");
      detailUrl.searchParams.append("metadataHeaders", "From");
      detailUrl.searchParams.append("metadataHeaders", "Subject");
      detailUrl.searchParams.append("metadataHeaders", "Date");

      const detailResponse = await fetch(detailUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const detail = (await detailResponse.json()) as GmailMessage & { error?: { message?: string } };

      if (!detailResponse.ok) {
        throw new Error(detail.error?.message ?? "Could not fetch a Gmail message.");
      }

      const from = parseSender(headerValue(detail, "From"));
      const subject = headerValue(detail, "Subject") || "(No subject)";
      const snippet = detail.snippet ?? "";
      const classification = classifyMail({
        sender: from.sender,
        email: from.email,
        subject,
        snippet,
      });

      return {
        id: detail.id,
        sender: from.sender,
        email: from.email,
        subject,
        snippet,
        receivedAt: formatGmailDate(detail.internalDate),
        category: classification.category,
        confidence: classification.confidence,
        unread: detail.labelIds?.includes("UNREAD") ?? false,
        reason: classification.reason,
        labels: [classification.category.toLowerCase(), "gmail", classification.confidence >= 90 ? "high confidence" : "review"],
      } satisfies MailItem;
    });

  return {
    messages,
    total: listData.resultSizeEstimate ?? messages.length,
    nextPageToken: listData.nextPageToken,
    batchSize,
  };
}

function mockResponse() {
  return {
    mode: "mock",
    imported: sampleEmails.length,
    total: 240,
    lastSync: new Date().toISOString(),
    messages: sampleEmails,
    note: "Mock batch returned because Gmail is not connected yet.",
  };
}

export async function POST(request: Request) {
  const { token, refreshed } = await getFreshGmailToken();

  if (!token) {
    return NextResponse.json(mockResponse());
  }

  try {
    const options = await parseSyncRequest(request);
    const gmail = await fetchGmailMessages(token.accessToken, options);
    const response = NextResponse.json({
      mode: "gmail",
      imported: gmail.messages.length,
      total: gmail.total,
      nextPageToken: gmail.nextPageToken,
      batchSize: gmail.batchSize,
      lastSync: new Date().toISOString(),
      messages: gmail.messages.length > 0 ? gmail.messages : sampleEmails,
      note:
        gmail.messages.length > 0
          ? `Fetched ${gmail.messages.length} Gmail messages. ${gmail.nextPageToken ? "Run Sync batch again for the next page." : "No more pages returned."}`
          : "Gmail connected, but no recent messages were returned. Showing mock data.",
    });

    if (refreshed) {
      writeGmailToken(response, token);
    }

    return response;
  } catch (err) {
    return NextResponse.json(
      {
        ...mockResponse(),
        mode: "error",
        note: err instanceof Error ? err.message : "Gmail sync failed.",
      },
      { status: 502 },
    );
  }
}
