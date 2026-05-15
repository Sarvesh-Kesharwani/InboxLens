export type CategoryKey =
  | "Important"
  | "Finance / Bills"
  | "Shopping / Orders"
  | "Travel"
  | "Work"
  | "Personal"
  | "Newsletters"
  | "Security / Login Alerts"
  | "Promotions"
  | "Needs Reply"
  | "Read Later"
  | "Unknown / Review";

export type MailItem = {
  id: string;
  sender: string;
  email: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  category: CategoryKey;
  confidence: number;
  unread: boolean;
  reason: string;
  labels: string[];
};

export type Rule = {
  id: string;
  pattern: string;
  category: CategoryKey;
  hits: number;
  enabled: boolean;
};

export type SyncState = {
  phase: "idle" | "connecting" | "importing" | "classifying" | "complete" | "error";
  imported: number;
  total: number;
  lastSync: string;
  message: string;
};
