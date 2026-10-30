// Типы ответов Flask API.

export type StatusKind = "bot" | "need" | "owner" | "wait";

export type Account = {
  email: string;
  company_id: string;
  business_name: string;
  telegram_link: string;
  bot_username: string;
  owner_telegram_linked: boolean;
  onboarding_completed: boolean;
  trial_days_left: number;
  trial_active: boolean;
};

export type ConversationState = {
  mode: "bot" | "manual";
  awaiting_owner: boolean;
  manual_reason: string | null;
  handoff_reason: string | null;
  resume_at: string | null;
  minutes_left: number | null;
  awaiting_since: string | null;
  version: number;
  archived: boolean;
};

export type ConversationItem = ConversationState & {
  key: string;
  telegram_id: number | null;
  contact: string | null;
  username: string;
  display_contact: string;
  name: string;
  channel: string;
  last_message: string;
  last_source: string | null;
  last_at: string | null;
  message_count: number;
  pending_payments: number;
  status: StatusKind;
};

export type ConversationList = {
  items: ConversationItem[];
  total: number;
  counts: Record<"all" | StatusKind, number>;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type ConversationDetail = ConversationState & {
  key: string;
  contact: string | null;
  telegram_id: number | null;
  name: string;
  username: string;
  display_contact: string;
  channel: string;
  first_at: string | null;
  status: StatusKind;
  pending_payments: number;
  can_reply: boolean;
};

export type Message = {
  _id: string;
  key: string;
  channel: string;
  name?: string;
  contact?: string;
  notes?: string | null;
  message?: string | null;
  ai_response?: string | null;
  answer_source?: string | null;
  status?: string | null;
  handoff?: boolean;
  handoff_reason?: string;
  kind?: string;
  delivery_failed?: boolean;
  created_at: string;
};

export type ServiceItem = { _id: string; name: string; price: string; stock?: string };
export type KnowledgeItem = { _id: string; question: string; answer: string };

export type ImportReport = {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string }[];
  delimiter: string;
};

export type PaymentItem = { name: string; quantity: number };
export type Payment = {
  _id: string;
  key: string | null;
  contact: string;
  name?: string;
  telegram_id: number;
  status: "pending" | "approved" | "rejected";
  items: PaymentItem[];
  mime_type: string;
  created_at: string;
  verified_at?: string;
};

export type Stats = {
  total_leads: number;
  total_bot_replies: number;
  owner_replies: number;
  handoffs: number;
  messages_today: number;
  active_leads: number;
  waiting_owner: number;
  pending_payments: number;
};

export type NotificationItem = {
  type: "need_owner";
  key: string;
  name: string;
  text: string;
  at: string | null;
  minutes_left: number | null;
};

export type Notifications = {
  items: NotificationItem[];
  need_owner: number;
  pending_payments: number;
  total: number;
  owner_telegram_linked: boolean;
};

export type TelegramSettings = {
  bot_username: string;
  client_link: string;
  owner_linked: boolean;
  owner_linked_at: string | null;
  link_code_active_until: string | null;
  bot_configured: boolean;
};

export type LinkCode = { code: string; expires_at: string; command: string; deep_link: string };

export type BusinessProfile = {
  business_name: string;
  business_type: string;
  about: string;
  hours: string;
  address: string;
  phone: string;
  delivery: string;
  conditions: string;
  tone: string;
  onboarding_completed: boolean;
};
