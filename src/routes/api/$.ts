// Прокси /api/* -> Flask backend на Render.
//
// Зачем: если сайт (vercel.app) обращается к API на другом домене (onrender.com),
// cookie сессии для браузера «сторонний». Safari/iPhone и режим инкогнито Chrome
// такие cookie блокируют — вход не сохраняется. Через этот прокси браузер
// общается только с доменом сайта, и cookie становится «своим».
//
// Включение на Vercel: VITE_API_URL=/ (запросы идут на этот же домен) и, при
// необходимости, API_PROXY_TARGET=https://zhauap.onrender.com (по умолчанию).
// Telegram webhook по-прежнему идёт напрямую на Render.

import { createFileRoute } from "@tanstack/react-router";

const DEFAULT_TARGET = "https://zhauap.onrender.com";
const TIMEOUT_MS = 90_000; // бесплатный Render может просыпаться до минуты

// Заголовки, которые нельзя пересылать между соединениями.
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
];

function targetBase(): string {
  const env = typeof process !== "undefined" ? process.env : undefined;
  const raw = env?.["API_PROXY_TARGET"]?.trim() || DEFAULT_TARGET;
  return raw.replace(/\/+$/, "");
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function proxy({ request }: { request: Request }): Promise<Response> {
  const incoming = new URL(request.url);
  const upstream = `${targetBase()}${incoming.pathname}${incoming.search}`;

  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP) headers.delete(name);
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(upstream, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : null,
      redirect: "manual",
      signal: controller.signal,
    });
  } catch {
    return jsonError(
      "Сервер Zhauap временно недоступен. Если он просыпается после простоя, повторите через минуту.",
      502,
    );
  } finally {
    clearTimeout(timer);
  }

  const out = new Headers(response.headers);
  for (const name of HOP_BY_HOP) out.delete(name);
  // fetch уже распаковал тело — исходная кодировка и длина больше не верны.
  out.delete("content-encoding");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: out,
  });
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: proxy,
      POST: proxy,
      PATCH: proxy,
      PUT: proxy,
      DELETE: proxy,
      OPTIONS: proxy,
      HEAD: proxy,
    },
  },
});
