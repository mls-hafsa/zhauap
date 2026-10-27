import { Instagram, MessageCircle, Send, MessageSquare } from "lucide-react";

export type Lead = {
  id: string;
  created_at: string;
  business_id: string | null;
  name: string | null;
  contact: string | null;
  status: string | null;
  notes: string | null;
  ai_response: string | null;
  answer_source: string | null;
};

export type ChannelName = "Telegram" | "WhatsApp" | "Instagram" | "Другое";
export type StatusKind = "bot" | "need" | "owner" | "wait";

export function channelOf(contact: string | null): ChannelName {
  const v = (contact ?? "").toLowerCase();
  if (v.includes("instagram") || v.includes("ig:")) return "Instagram";
  if (v.includes("wa") || v.includes("whatsapp") || /^\+?\d[\d\s()-]{6,}$/.test(v.trim()))
    return "WhatsApp";
  if (v.startsWith("@") || v.includes("t.me") || v.includes("telegram")) return "Telegram";
  return "Другое";
}

export function channelIcon(channel: ChannelName) {
  if (channel === "Instagram") return Instagram;
  if (channel === "WhatsApp") return MessageCircle;
  if (channel === "Telegram") return Send;
  return MessageSquare;
}

export function statusKind(status: string | null): StatusKind {
  const v = (status ?? "").toLowerCase();
  if (["bot", "answered", "bot_replied", "отвечено"].includes(v)) return "bot";
  if (["need", "need_owner", "needs_owner", "escalated", "нужен владелец"].includes(v))
    return "need";
  if (["owner", "manual", "in_progress", "владелец"].includes(v)) return "owner";
  return "wait";
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

const API_URL = import.meta.env["VITE_API_URL"] || "http://localhost:5000";

export function getCompanyId(): string {
  try {
    return localStorage.getItem("company_id") || "";
  } catch {
    return "";
  }
}

// Полноценная форма документа из MongoDB
type LeadFromApi = {
  _id: string;
  company_id?: string;
  name?: string;
  contact?: string;
  notes?: string;
  message?: string;
  ai_response?: string;
  answer_source?: string;
  status?: string;
  created_at: string;
};

function mapApiLeadToLead(raw: LeadFromApi): Lead {
  return {
    id: raw._id,
    created_at: raw.created_at,
    business_id: raw.company_id ?? null,
    name: raw.name ?? null,
    contact: raw.contact ?? null,
    notes: raw.notes ?? raw.message ?? null, // поддерживаем и notes, и message
    status: raw.status ?? (raw.ai_response ? "bot" : "wait"), // берём родной статус из БД
    ai_response: raw.ai_response ?? null,
    answer_source: raw.answer_source ?? null,
  };
}

export async function fetchLeads(): Promise<Lead[]> {
  const response = await fetch(`${API_URL}/api/leads`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include", // передаём cookie сессии на Flask
  });

  if (!response.ok) {
    throw new Error(`Не удалось загрузить лидов: ${response.status}`);
  }
  const data: LeadFromApi[] = await response.json();
  return data.map(mapApiLeadToLead);
}

export const leadsAreDemo = false;
