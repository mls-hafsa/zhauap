// Запуск: npm test  (node --experimental-strip-types --test tests/)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  channelOf,
  formatTime,
  initials,
  mergeMessages,
  minutesWord,
  passwordAcceptable,
  passwordChecks,
  replyLabel,
  replySide,
  resumeText,
  statusKind,
} from "../src/lib/chat-utils.ts";

test("channelOf uses explicit channel field", () => {
  assert.equal(channelOf("telegram", "123456789"), "Telegram");
  assert.equal(channelOf("whatsapp", null), "WhatsApp");
  assert.equal(channelOf("instagram", null), "Instagram");
});

test("channelOf: old records without channel are Telegram, not WhatsApp/Other", () => {
  // Регрессия: раньше числовой ID считался WhatsApp, а ник без @ — «Другое».
  assert.equal(channelOf(undefined, "123456789"), "Telegram");
  assert.equal(channelOf(null, "zeinab_mels"), "Telegram");
  assert.equal(channelOf(null, "wanderer"), "Telegram");
  assert.equal(channelOf(null, null), "Другое");
});

test("statusKind maps backend statuses", () => {
  assert.equal(statusKind("bot"), "bot");
  assert.equal(statusKind("need"), "need");
  assert.equal(statusKind("owner"), "owner");
  assert.equal(statusKind("manual"), "owner");
  assert.equal(statusKind("wait"), "wait");
  assert.equal(statusKind(null), "wait");
});

test("formatTime: today, yesterday, older, invalid", () => {
  const now = new Date("2026-10-30T12:00:00");
  assert.match(formatTime("2026-10-30T09:05:00", now), /09:05/);
  assert.equal(formatTime("2026-10-29T09:05:00", now), "Вчера");
  assert.notEqual(formatTime("2026-10-01T09:05:00", now), "");
  assert.equal(formatTime("not a date", now), "");
  assert.equal(formatTime(null, now), "");
});

test("Russian plural for minutes", () => {
  assert.equal(minutesWord(1), "минуту");
  assert.equal(minutesWord(3), "минуты");
  assert.equal(minutesWord(5), "минут");
  assert.equal(minutesWord(11), "минут");
  assert.equal(minutesWord(21), "минуту");
  assert.equal(resumeText(7), "через 7 минут");
  assert.equal(resumeText(0), "в течение минуты");
  assert.equal(resumeText(null), "");
});

test("initials", () => {
  assert.equal(initials("Айгуль Серикова"), "АС");
  assert.equal(initials(""), "?");
  assert.equal(initials("zhauap", "Z"), "Z");
});

test("reply side and label", () => {
  assert.equal(replySide("owner"), "owner");
  assert.equal(replySide("ai"), "bot");
  assert.equal(replySide("system"), "system");
  assert.equal(replyLabel("knowledge_base"), "Бот · база знаний");
  assert.equal(replyLabel("ai", "auto_resume"), "Бот · вместо владельца");
  assert.equal(replyLabel("owner"), "Вы");
});

test("mergeMessages deduplicates and sorts chronologically", () => {
  const a = { _id: "a", created_at: "2026-10-30T10:00:00Z" };
  const b = { _id: "b", created_at: "2026-10-30T10:01:00Z" };
  const c = { _id: "c", created_at: "2026-10-30T10:02:00Z" };
  assert.deepEqual(
    mergeMessages([b, c], [a, b]).map((m) => m._id),
    ["a", "b", "c"],
  );
});

test("password rules match backend policy", () => {
  assert.equal(passwordAcceptable("Secret123"), true);
  assert.equal(passwordAcceptable("secret123"), true); // регистр — только рекомендация
  assert.equal(passwordAcceptable("12345678"), false);
  assert.equal(passwordAcceptable("abcdefgh"), false);
  assert.equal(passwordAcceptable("Ab1"), false);
  assert.equal(passwordChecks("Пароль2026").filter((c) => c.required && !c.ok).length, 0);
});
