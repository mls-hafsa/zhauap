// Запросы к API и ключи React Query в одном месте.

import { api } from "./api";
import type {
  Account,
  BusinessProfile,
  ConversationDetail,
  ConversationList,
  ImportReport,
  KnowledgeItem,
  LinkCode,
  Message,
  Notifications,
  Payment,
  ServiceItem,
  Stats,
  TelegramSettings,
} from "./types";

export const qk = {
  me: ["me"] as const,
  conversations: (params: Record<string, unknown>) => ["conversations", params] as const,
  conversationsAll: ["conversations"] as const,
  conversation: (key: string) => ["conversation", key] as const,
  messages: (key: string) => ["messages", key] as const,
  notifications: ["notifications"] as const,
  services: ["services"] as const,
  knowledge: ["knowledge-base"] as const,
  payments: (status: string) => ["payments", status] as const,
  paymentsAll: ["payments"] as const,
  stats: ["stats"] as const,
  paymentSettings: ["payment-settings"] as const,
  business: ["business"] as const,
  telegram: ["telegram-settings"] as const,
};

const enc = encodeURIComponent;

// ---------- аккаунт ----------
export const fetchMe = () => api<Account>("/api/me", { quiet401: true });
export const login = (email: string, password: string) =>
  api<Account & { message: string }>("/api/login", {
    method: "POST",
    body: { email, password },
    quiet401: true,
  });
export const registerAccount = (email: string, password: string, business_name: string) =>
  api<Account & { message: string }>("/api/register", {
    method: "POST",
    body: { email, password, business_name },
  });
export const logout = () => api<{ message: string }>("/api/logout", { method: "POST" });
export const requestPasswordReset = (email: string) =>
  api<{ message: string }>("/api/auth/forgot", { method: "POST", body: { email } });
export const resetPassword = (email: string, code: string, password: string) =>
  api<{ message: string }>("/api/auth/reset", { method: "POST", body: { email, code, password } });
export const changePassword = (current_password: string, new_password: string) =>
  api<{ message: string }>("/api/account/password", {
    method: "POST",
    body: { current_password, new_password },
  });

// ---------- диалоги ----------
export type ConversationQuery = { q?: string; status?: string; limit?: number };
export function fetchConversations(params: ConversationQuery) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status && params.status !== "all") search.set("status", params.status);
  search.set("limit", String(params.limit ?? 50));
  return api<ConversationList>(`/api/conversations?${search.toString()}`);
}
export const fetchConversation = (key: string) =>
  api<ConversationDetail>(`/api/conversations/${enc(key)}`);
export function fetchMessages(key: string, before?: string, limit = 50) {
  const search = new URLSearchParams({ limit: String(limit) });
  if (before) search.set("before", before);
  return api<{ items: Message[]; has_more: boolean }>(
    `/api/conversations/${enc(key)}/messages?${search}`,
  );
}
export const setConversationMode = (key: string, mode: "bot" | "manual") =>
  api<ConversationDetail>(`/api/conversations/${enc(key)}`, { method: "PATCH", body: { mode } });
export const sendOwnerReply = (key: string, message: string) =>
  api<{ message: string }>(`/api/conversations/${enc(key)}/send`, {
    method: "POST",
    body: { message },
  });
export const archiveConversation = (key: string) =>
  api<{ message: string }>(`/api/conversations/${enc(key)}`, { method: "DELETE" });
export const fetchNotifications = () => api<Notifications>("/api/notifications");
export const fetchStats = () => api<Stats>("/api/stats");

// ---------- каталог ----------
export const fetchServices = () => api<ServiceItem[]>("/api/services");
export const createService = (payload: { name: string; price: string; stock: string }) =>
  api<{ id: string }>("/api/services", { method: "POST", body: payload });
export const updateService = (
  id: string,
  payload: Partial<{ name: string; price: string; stock: string }>,
) => api<{ message: string }>(`/api/services/${enc(id)}`, { method: "PATCH", body: payload });
export const deleteService = (id: string) =>
  api<{ message: string }>(`/api/services/${enc(id)}`, { method: "DELETE" });

export function uploadCsv(
  path: "/api/products/upload-csv" | "/api/knowledge-base/upload-csv",
  file: File,
) {
  const form = new FormData();
  form.append("file", file);
  return api<{ message: string; report: ImportReport }>(path, { method: "POST", form });
}

// ---------- база знаний ----------
export const fetchKnowledge = () => api<KnowledgeItem[]>("/api/knowledge-base");
export const createKnowledge = (payload: { question: string; answer: string }) =>
  api<{ id: string }>("/api/knowledge-base", { method: "POST", body: payload });
export const updateKnowledge = (id: string, payload: { question: string; answer: string }) =>
  api<{ message: string }>(`/api/knowledge-base/${enc(id)}`, { method: "PATCH", body: payload });
export const deleteKnowledge = (id: string) =>
  api<{ message: string }>(`/api/knowledge-base/${enc(id)}`, { method: "DELETE" });

// ---------- оплаты ----------
export const fetchPayments = (status: string) =>
  api<Payment[]>(`/api/payments/pending?status=${enc(status)}`);
export const verifyPayment = (id: string, status: "approved" | "rejected") =>
  api<{ message: string; warning?: string }>(`/api/payments/${enc(id)}/verify`, {
    method: "POST",
    body: { status },
  });

// ---------- настройки ----------
export const fetchPaymentSettings = () =>
  api<{ payment_info: string; payment_qr: string }>("/api/settings/payment");
export const savePaymentSettings = (payload: { payment_info?: string; payment_qr?: string }) =>
  api<{ message: string }>("/api/settings/payment", { method: "PATCH", body: payload });
export const fetchBusiness = () => api<BusinessProfile>("/api/settings/business");
export const saveBusiness = (payload: Partial<BusinessProfile>) =>
  api<{ message: string }>("/api/settings/business", { method: "PATCH", body: payload });
export const fetchTelegramSettings = () => api<TelegramSettings>("/api/settings/telegram");
export const createLinkCode = () =>
  api<LinkCode>("/api/settings/telegram/link-code", { method: "POST" });
export const unlinkTelegram = () =>
  api<{ message: string }>("/api/settings/telegram", { method: "DELETE" });
