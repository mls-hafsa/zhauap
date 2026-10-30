// Чистые функции без зависимостей — покрыты тестами в tests/chat-utils.test.ts.

export type ChannelName = "Telegram" | "WhatsApp" | "Instagram" | "Другое";
export type StatusKind = "bot" | "need" | "owner" | "wait";

/**
 * Канал диалога. Backend сохраняет явное поле channel ("telegram").
 * Раньше канал угадывался по тексту контакта, и Telegram-ник без «@» попадал в
 * «Другое», а числовой Telegram ID и любой ник с «wa» — в «WhatsApp».
 */
export function channelOf(channel?: string | null, contact?: string | null): ChannelName {
  const value = (channel ?? "").trim().toLowerCase();
  if (value === "telegram" || value === "tg") return "Telegram";
  if (value === "whatsapp" || value === "wa") return "WhatsApp";
  if (value === "instagram" || value === "ig") return "Instagram";
  if (value) return "Другое";
  // Старые записи без поля channel: сейчас единственный подключённый канал — Telegram.
  return contact ? "Telegram" : "Другое";
}

export function statusKind(status: string | null | undefined): StatusKind {
  const v = (status ?? "").toLowerCase();
  if (["bot", "answered", "bot_replied", "отвечено"].includes(v)) return "bot";
  if (["need", "need_owner", "needs_owner", "escalated", "нужен владелец"].includes(v))
    return "need";
  if (["owner", "manual", "in_progress", "владелец"].includes(v)) return "owner";
  return "wait";
}

export function formatTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

export function minutesWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "минуту";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "минуты";
  return "минут";
}

/** Сколько осталось до возврата AI: «через 7 минут» / «в течение минуты». */
export function resumeText(minutesLeft: number | null | undefined): string {
  if (minutesLeft === null || minutesLeft === undefined) return "";
  if (minutesLeft <= 0) return "в течение минуты";
  return `через ${minutesLeft} ${minutesWord(minutesLeft)}`;
}

export function initials(name: string | null | undefined, fallback = "?"): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return fallback;
  const letters = words.slice(0, 2).map((w) => w.charAt(0).toUpperCase());
  return letters.join("");
}

export type MessageSide = "client" | "bot" | "owner" | "system";

export function replySide(answerSource: string | null | undefined): MessageSide {
  if (answerSource === "owner") return "owner";
  if (answerSource === "system") return "system";
  return "bot";
}

export function replyLabel(answerSource: string | null | undefined, kind?: string | null): string {
  if (answerSource === "owner") return "Вы";
  if (answerSource === "system") return "Система";
  if (answerSource === "knowledge_base") return "Бот · база знаний";
  if (kind === "auto_resume") return "Бот · вместо владельца";
  return "Бот";
}

/** Объединяет страницы сообщений без дублей и в хронологическом порядке. */
export function mergeMessages<T extends { _id: string; created_at: string }>(...pages: T[][]): T[] {
  const byId = new Map<string, T>();
  for (const page of pages) for (const m of page) byId.set(m._id, m);
  return Array.from(byId.values()).sort((a, b) => {
    const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return diff !== 0 ? diff : a._id.localeCompare(b._id);
  });
}

export type PasswordCheck = { label: string; ok: boolean; required: boolean };

/** Те же правила, что проверяет backend (обязательные), плюс рекомендации. */
export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { label: "Не менее 8 символов", ok: password.length >= 8, required: true },
    {
      label: "Есть буква",
      ok: /[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/.test(password),
      required: true,
    },
    { label: "Есть цифра", ok: /\d/.test(password), required: true },
    {
      label: "Заглавная и строчная (желательно)",
      ok: /[A-ZА-ЯЁ]/.test(password) && /[a-zа-яё]/.test(password),
      required: false,
    },
  ];
}

export function passwordAcceptable(password: string): boolean {
  return passwordChecks(password).every((c) => !c.required || c.ok);
}
