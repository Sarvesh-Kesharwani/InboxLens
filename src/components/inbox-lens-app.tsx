"use client";

import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  Clock3,
  CreditCard,
  Inbox,
  LockKeyhole,
  Mail,
  Plane,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Tag,
  UserRound,
  Wand2,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { categories, categoryColors, initialRules, initialSyncState, sampleEmails } from "@/lib/data";
import type { CategoryKey, MailItem, Rule, SyncState } from "@/lib/types";

const navItems = ["Dashboard", "Categories", "Search", "Rules", "Sync", "Settings"];

const categoryIcons: Record<CategoryKey, typeof Inbox> = {
  Important: AlertTriangle,
  "Finance / Bills": CreditCard,
  "Shopping / Orders": ShoppingBag,
  Travel: Plane,
  Work: Inbox,
  Personal: UserRound,
  Newsletters: Mail,
  "Security / Login Alerts": LockKeyhole,
  Promotions: Tag,
  "Needs Reply": Clock3,
  "Read Later": ArrowDownToLine,
  "Unknown / Review": ShieldCheck,
};

function formatPercent(value: number) {
  return `${value}%`;
}

function phaseLabel(phase: SyncState["phase"]) {
  if (phase === "idle") return "Ready";
  if (phase === "connecting") return "Connecting";
  if (phase === "importing") return "Importing";
  if (phase === "classifying") return "Classifying";
  if (phase === "complete") return "Synced";
  return "Needs attention";
}

export function InboxLensApp() {
  const [emails, setEmails] = useState<MailItem[]>(sampleEmails);
  const [selectedId, setSelectedId] = useState(sampleEmails[0]?.id ?? "");
  const [activeCategory, setActiveCategory] = useState<CategoryKey | "All">("All");
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [ruleDraft, setRuleDraft] = useState("");
  const [ruleCategory, setRuleCategory] = useState<CategoryKey>("Important");
  const [sync, setSync] = useState<SyncState>(initialSyncState);
  const [notice, setNotice] = useState("Private mock workspace. Gmail OAuth is ready to configure.");
  const [gmailAccount, setGmailAccount] = useState<string | null>(null);
  const [gmailNextPageToken, setGmailNextPageToken] = useState<string | null>(null);
  const [gmailTotalEstimate, setGmailTotalEstimate] = useState<number | null>(null);

  const counts = useMemo(() => {
    return categories.map((category) => ({
      category,
      count: emails.filter((email) => email.category === category).length,
      unread: emails.filter((email) => email.category === category && email.unread).length,
      average:
        emails
          .filter((email) => email.category === category)
          .reduce((total, email) => total + email.confidence, 0) /
          Math.max(1, emails.filter((email) => email.category === category).length) || 0,
    }));
  }, [emails]);

  const filteredEmails = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return emails.filter((email) => {
      const matchesCategory = activeCategory === "All" || email.category === activeCategory;
      const matchesQuery =
        !needle ||
        [email.sender, email.email, email.subject, email.snippet, email.category, email.reason]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, emails, query]);

  const selectedEmail = emails.find((email) => email.id === selectedId) ?? filteredEmails[0] ?? emails[0];
  const progress = Math.round((sync.imported / Math.max(sync.total, 1)) * 100);
  const gmailLoadedCount = emails.filter((email) => email.labels.includes("gmail")).length;
  const syncButtonLabel = gmailAccount
    ? gmailNextPageToken
      ? "Load next 500"
      : gmailLoadedCount > 0
        ? "Check next page"
        : "Import first 500"
    : "Sync batch";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailStatus = params.get("gmail");
    const gmailMessage = params.get("message");

    if (gmailStatus === "connected") {
      setNotice("Gmail connected. Run Sync batch to import recent messages.");
      window.history.replaceState(null, "", "/");
    } else if (gmailStatus === "error") {
      setNotice(`Gmail connection failed: ${gmailMessage ?? "unknown error"}`);
      setSync((current) => ({ ...current, phase: "error", message: "Gmail connection failed" }));
      window.history.replaceState(null, "", "/");
    }

    fetch("/api/gmail/status")
      .then((response) => response.json())
      .then((status) => {
        if (status.connected) {
          setGmailAccount(status.email ?? "Connected Gmail account");
          setSync((current) => ({ ...current, phase: "complete", message: "Gmail connected" }));
          setNotice("Gmail OAuth is connected. Sync batch will fetch recent messages with gmail.readonly.");
        }
      })
      .catch(() => {
        setNotice("Could not read Gmail connection status.");
      });
  }, []);

  async function connectGmail() {
    setSync((current) => ({ ...current, phase: "connecting", message: "Checking Gmail OAuth configuration" }));
    const response = await fetch("/api/gmail/connect");
    const data = await response.json();

    if (data.configured && data.authUrl) {
      setNotice("Opening Google consent for gmail.readonly access.");
      window.location.href = data.authUrl;
      return;
    }

    setSync((current) => ({ ...current, phase: "idle", message: "OAuth credentials missing" }));
    setNotice(
      data.message ??
        "Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI to .env.local, then restart the dev server.",
    );
  }

  async function runSync() {
    setSync({
      phase: "importing",
      imported: gmailAccount ? gmailLoadedCount : 0,
      total: gmailTotalEstimate ?? sync.total,
      lastSync: sync.lastSync,
      message: gmailAccount ? "Fetching the next Gmail page" : "Fetching mock Gmail message IDs",
    });

    if (!gmailAccount) {
      for (const imported of [36, 84, 132, 186]) {
        await new Promise((resolve) => window.setTimeout(resolve, 180));
        setSync((current) => ({ ...current, imported }));
      }
    }

    setSync((current) => ({ ...current, phase: "classifying", message: "Applying rules, then LLM fallback where needed" }));
    if (!gmailAccount) {
      await new Promise((resolve) => window.setTimeout(resolve, 280));
    }

    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageToken: gmailAccount ? gmailNextPageToken : undefined,
        maxResults: 500,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setSync((current) => ({
        ...current,
        phase: "error",
        message: data.note ?? "Gmail sync failed",
      }));
      setNotice(data.note ?? "Gmail sync failed. Reconnect Gmail and try again.");
      return;
    }

    const nextMessages = data.messages as MailItem[];
    let nextLoadedCount = nextMessages.length;

    if (data.mode === "gmail") {
      const byId = new Map(emails.filter((email) => email.labels.includes("gmail")).map((email) => [email.id, email]));
      for (const message of nextMessages) {
        byId.set(message.id, message);
      }

      const merged = Array.from(byId.values());
      nextLoadedCount = merged.length;
      setEmails(merged);
      setGmailNextPageToken(data.nextPageToken ?? null);
      setGmailTotalEstimate(data.total ?? null);
      setSelectedId(nextMessages[0]?.id ?? selectedId);
    } else {
      setEmails(nextMessages);
      setSelectedId(nextMessages[0]?.id ?? "");
      setGmailNextPageToken(null);
      setGmailTotalEstimate(null);
    }

    setSync({
      phase: "complete",
      imported: data.mode === "gmail" ? nextLoadedCount : data.total,
      total: data.total,
      lastSync: new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
      message: data.mode === "gmail" ? "Gmail import complete" : "Mock import complete",
    });
    setNotice(data.note ?? "Imported and classified the latest batch.");
  }

  async function disconnectGmail() {
    await fetch("/api/gmail/disconnect", { method: "POST" });
    setGmailAccount(null);
    setGmailNextPageToken(null);
    setGmailTotalEstimate(null);
    setSync((current) => ({ ...current, phase: "idle", message: "Gmail disconnected" }));
    setNotice("Gmail disconnected. The dashboard is back in mock mode.");
  }

  function updateCategory(emailId: string, category: CategoryKey) {
    setEmails((current) =>
      current.map((email) =>
        email.id === emailId
          ? {
              ...email,
              category,
              confidence: Math.max(email.confidence, 88),
              reason: `Manually corrected to ${category}. Future rules can learn this preference.`,
            }
          : email,
      ),
    );
    setNotice(`Saved correction for ${category}.`);
  }

  function addRule() {
    const pattern = ruleDraft.trim();
    if (!pattern) return;

    setRules((current) => [
      {
        id: `rule-${Date.now()}`,
        pattern,
        category: ruleCategory,
        hits: 0,
        enabled: true,
      },
      ...current,
    ]);
    setRuleDraft("");
    setNotice(`Rule added for ${ruleCategory}.`);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <Image src="/logo.svg" alt="InboxLens logo" width={44} height={44} priority />
          <div>
            <strong>InboxLens</strong>
            <span>Gmail intelligence</span>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              className={item === activeNav ? "nav-item active" : "nav-item"}
              key={item}
              onClick={() => setActiveNav(item)}
              type="button"
            >
              {item === "Dashboard" && <Inbox size={18} />}
              {item === "Categories" && <Tag size={18} />}
              {item === "Search" && <Search size={18} />}
              {item === "Rules" && <Wand2 size={18} />}
              {item === "Sync" && <RefreshCw size={18} />}
              {item === "Settings" && <Settings size={18} />}
              <span>{item}</span>
            </button>
          ))}
        </nav>

        <section className="privacy-panel">
          <ShieldCheck size={20} />
          <div>
            <strong>Read-only first</strong>
            <p>Uses `gmail.readonly` for app categories. No Gmail label writes in the MVP.</p>
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>InboxLens</h1>
            <p>Classify Gmail into practical queues with rules, review, and controlled sync.</p>
          </div>
          <div className="topbar-actions">
            <div className={`sync-pill ${sync.phase}`}>
              <span />
              {gmailAccount ?? phaseLabel(sync.phase)}
            </div>
            <button className="secondary-button" onClick={runSync} type="button">
              <RefreshCw size={16} />
              {syncButtonLabel}
            </button>
            <button className="primary-button" onClick={connectGmail} type="button">
              <Mail size={16} />
              {gmailAccount ? "Reconnect Gmail" : "Connect Gmail"}
            </button>
            {gmailAccount ? (
              <button className="secondary-button" onClick={disconnectGmail} type="button">
                Disconnect
              </button>
            ) : null}
          </div>
        </header>

        <div className="notice-row">
          <div>
            <strong>{sync.message}</strong>
            <span>{notice}</span>
            {gmailAccount && gmailTotalEstimate ? (
              <span>
                Loaded {gmailLoadedCount.toLocaleString()} of about {gmailTotalEstimate.toLocaleString()} Gmail messages
                {gmailNextPageToken ? ". More pages are available." : "."}
              </span>
            ) : null}
          </div>
          <div className="progress-track" aria-label="Import progress">
            <div style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-label">{progress}%</span>
        </div>

        <section className="metric-grid" aria-label="Category counts">
          <button className={activeCategory === "All" ? "metric-card selected" : "metric-card"} onClick={() => setActiveCategory("All")} type="button">
            <div className="metric-icon all">
              <Inbox size={19} />
            </div>
            <span>All mail</span>
            <strong>{emails.length}</strong>
            <small>{emails.filter((email) => email.unread).length} unread-like</small>
          </button>

          {counts.map(({ category, count, unread, average }) => {
            const Icon = categoryIcons[category];
            return (
              <button
                className={activeCategory === category ? "metric-card selected" : "metric-card"}
                key={category}
                onClick={() => setActiveCategory(category)}
                style={{ "--category-color": categoryColors[category] } as React.CSSProperties}
                type="button"
              >
                <div className="metric-icon">
                  <Icon size={19} />
                </div>
                <span>{category}</span>
                <strong>{count}</strong>
                <small>
                  {unread} unread - {formatPercent(Math.round(average))} avg
                </small>
              </button>
            );
          })}
        </section>

        <section className="content-grid">
          <div className="mail-panel">
            <div className="panel-heading">
              <div>
                <h2>{activeCategory === "All" ? "Review queue" : activeCategory}</h2>
                <p>{filteredEmails.length} messages matched</p>
              </div>
              <label className="search-box">
                <Search size={17} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sender, subject, reason" />
              </label>
            </div>

            <div className="mail-table" role="table" aria-label="Classified emails">
              <div className="mail-row table-head" role="row">
                <span>Sender</span>
                <span>Subject</span>
                <span>Category</span>
                <span>Confidence</span>
                <span>Time</span>
              </div>

              {filteredEmails.map((email) => (
                <button
                  className={selectedEmail?.id === email.id ? "mail-row selected" : "mail-row"}
                  key={email.id}
                  onClick={() => setSelectedId(email.id)}
                  role="row"
                  type="button"
                >
                  <span>
                    <strong>{email.sender}</strong>
                    <small>{email.email}</small>
                  </span>
                  <span>
                    <strong>{email.subject}</strong>
                    <small>{email.snippet}</small>
                  </span>
                  <span>
                    <mark style={{ "--category-color": categoryColors[email.category] } as React.CSSProperties}>{email.category}</mark>
                  </span>
                  <span>{formatPercent(email.confidence)}</span>
                  <span>{email.receivedAt}</span>
                </button>
              ))}
            </div>
          </div>

          <aside className="inspector-panel" aria-label="Selected email">
            {selectedEmail ? (
              <>
                <div className="inspector-header">
                  <span style={{ background: categoryColors[selectedEmail.category] }} />
                  <div>
                    <h2>{selectedEmail.subject}</h2>
                    <p>{selectedEmail.sender}</p>
                  </div>
                </div>

                <div className="summary-box">
                  <strong>Classification reason</strong>
                  <p>{selectedEmail.reason}</p>
                </div>

                <dl className="detail-list">
                  <div>
                    <dt>Category</dt>
                    <dd>{selectedEmail.category}</dd>
                  </div>
                  <div>
                    <dt>Confidence</dt>
                    <dd>{formatPercent(selectedEmail.confidence)}</dd>
                  </div>
                  <div>
                    <dt>Received</dt>
                    <dd>{selectedEmail.receivedAt}</dd>
                  </div>
                </dl>

                <label className="field">
                  <span>Recategorize</span>
                  <select value={selectedEmail.category} onChange={(event) => updateCategory(selectedEmail.id, event.target.value as CategoryKey)}>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="tag-list">
                  {selectedEmail.labels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
              </>
            ) : null}
          </aside>
        </section>

        <section className="bottom-grid">
          <div className="rules-panel">
            <div className="panel-heading compact">
              <div>
                <h2>Rules</h2>
                <p>Corrections can become deterministic rules before AI fallback.</p>
              </div>
            </div>

            <div className="rule-create">
              <input value={ruleDraft} onChange={(event) => setRuleDraft(event.target.value)} placeholder="Sender or keyword pattern" />
              <select value={ruleCategory} onChange={(event) => setRuleCategory(event.target.value as CategoryKey)}>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <button onClick={addRule} type="button">
                Add rule
              </button>
            </div>

            <div className="rules-list">
              {rules.map((rule) => (
                <div className="rule-row" key={rule.id}>
                  <div>
                    <strong>{rule.pattern}</strong>
                    <span>{rule.category}</span>
                  </div>
                  <small>{rule.hits} hits</small>
                  <button
                    className={rule.enabled ? "toggle enabled" : "toggle"}
                    onClick={() =>
                      setRules((current) => current.map((item) => (item.id === rule.id ? { ...item, enabled: !item.enabled } : item)))
                    }
                    type="button"
                  >
                    {rule.enabled ? "On" : "Off"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="settings-panel">
            <div className="panel-heading compact">
              <div>
                <h2>Privacy and deployment</h2>
                <p>Built for a private Render deployment with explicit Gmail scope control.</p>
              </div>
            </div>

            <div className="setting-list">
              <div>
                <CheckCircle2 size={18} />
                <span>Store categories, confidence, sender, subject, timestamp, and Gmail message ID.</span>
              </div>
              <div>
                <CheckCircle2 size={18} />
                <span>Avoid storing full raw email bodies unless a future feature needs it.</span>
              </div>
              <div>
                <AlertTriangle size={18} />
                <span>Public launch needs OAuth verification planning for restricted Gmail scopes.</span>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
