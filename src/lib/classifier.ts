import { categories } from "./data";
import type { CategoryKey, MailItem } from "./types";

const shoppingSiteTerms = [
  "amaz",
  "amazon",
  "amazon.in",
  "flipkart",
  "myntra",
  "nykaa",
  "nyka",
  "skinkraft",
  "skin kraft",
  "ajio",
  "meesho",
  "tatacliq",
  "tata cliq",
  "snapdeal",
  "firstcry",
  "shopsy",
  "shopclues",
  "purplle",
  "lenskart",
  "zepto",
  "bigbasket",
  "blinkit",
  "swiggy instamart",
];

const keywordRules: Array<{ category: CategoryKey; terms: string[]; reason: string }> = [
  {
    category: "Security / Login Alerts",
    terms: ["sign-in", "signin", "password", "otp", "verification", "security", "login"],
    reason: "Security or authentication language detected.",
  },
  {
    category: "Finance / Bills",
    terms: ["bank", "statement", "invoice", "bill", "payment", "card", "due"],
    reason: "Finance, billing, or payment language detected.",
  },
  {
    category: "Shopping",
    terms: shoppingSiteTerms,
    reason: "Shopping website or marketplace sender detected.",
  },
  {
    category: "Shopping / Orders",
    terms: ["order", "package", "delivered", "shipment", "invoice", "tracking", "return", "refund"],
    reason: "Order or marketplace language detected.",
  },
  {
    category: "Travel",
    terms: ["flight", "hotel", "booking", "itinerary", "check-in", "boarding"],
    reason: "Travel booking or itinerary language detected.",
  },
  {
    category: "Needs Reply",
    terms: ["can you", "please send", "reply", "respond", "confirm", "?"],
    reason: "Direct request language detected.",
  },
  {
    category: "Newsletters",
    terms: ["weekly", "digest", "updates", "newsletter"],
    reason: "Digest or newsletter pattern detected.",
  },
  {
    category: "Promotions",
    terms: ["discount", "sale", "offer", "% off", "ends tonight"],
    reason: "Promotional language detected.",
  },
];

export function classifyMail(input: Pick<MailItem, "sender" | "subject" | "snippet" | "email">): {
  category: CategoryKey;
  confidence: number;
  reason: string;
} {
  const haystack = `${input.sender} ${input.email} ${input.subject} ${input.snippet}`.toLowerCase();
  const senderAndEmail = `${input.sender} ${input.email}`.toLowerCase();
  const shoppingSiteHits = shoppingSiteTerms.filter((term) => senderAndEmail.includes(term)).length;

  if (shoppingSiteHits > 0) {
    return {
      category: "Shopping",
      confidence: Math.min(96, 86 + shoppingSiteHits * 5),
      reason: "Shopping website sender or domain matched the marketplace rule.",
    };
  }

  const ranked = keywordRules
    .map((rule) => {
      const hits = rule.terms.filter((term) => haystack.includes(term)).length;
      return { ...rule, hits };
    })
    .filter((rule) => rule.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  const top = ranked[0];
  if (!top) {
    return {
      category: categories.includes("Unknown / Review") ? "Unknown / Review" : "Important",
      confidence: 52,
      reason: "No deterministic rule matched, so this needs review or LLM fallback.",
    };
  }

  return {
    category: top.category,
    confidence: Math.min(96, 68 + top.hits * 9),
    reason: top.reason,
  };
}
