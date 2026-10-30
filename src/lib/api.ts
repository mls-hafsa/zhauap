// Единый клиент для Flask API: cookie-сессия, разбор ошибок, понятные сообщения.

const rawApiUrl = import.meta.env["VITE_API_URL"] as string | undefined;
export const API_URL =
  rawApiUrl && rawApiUrl.trim() !== ""
    ? rawApiUrl.trim().replace(/\/$/, "")
    : "http://localhost:5000";

export const UNAUTHORIZED_EVENT = "zhauap:unauthorized";

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
  /** Не сообщать приложению о 401 (например, при проверке «вошёл ли пользователь»). */
  quiet401?: boolean;
};

async function parseBody(response: Response): Promise<Record<string, unknown> | unknown[] | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown> | unknown[];
  } catch {
    return null;
  }
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, form, signal, quiet401 = false } = options;
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: payload ?? null,
      credentials: "include",
      signal: signal ?? null,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(
      "Нет связи с сервером. Проверьте интернет — если сервер просыпается после простоя, повторите через полминуты.",
      0,
    );
  }

  const data = await parseBody(response);
  if (!response.ok) {
    const record = (data && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
    const message =
      typeof record["error"] === "string"
        ? (record["error"] as string)
        : response.status === 413
          ? "Файл или запрос слишком большой."
          : `Ошибка сервера (${response.status}). Попробуйте ещё раз.`;
    if (response.status === 401 && !quiet401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(message, response.status, record);
  }
  if (data === null) {
    throw new ApiError(`Сервер ответил не JSON (код ${response.status}).`, response.status);
  }
  return data as T;
}

export function errorMessage(
  error: unknown,
  fallback = "Что-то пошло не так. Попробуйте ещё раз.",
): string {
  if (error instanceof ApiError || error instanceof Error) return error.message || fallback;
  return fallback;
}
