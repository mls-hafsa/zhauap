// Базовый адрес Python-сервера. Меняется в .env: VITE_API_URL=http://localhost
const rawApiUrl = import.meta.env["VITE_API_URL"];
const API_URL = rawApiUrl && rawApiUrl.trim() !== "" ? rawApiUrl : "http://localhost:5000";
function saveSession(data: {
  company_id?: string;
  business_name?: string;
  telegram_link?: string;
  email?: string;
  trial_days_left?: number;
}) {
  try {
    if (data.company_id) localStorage.setItem("company_id", data.company_id);
    if (data.business_name) localStorage.setItem("business_name", data.business_name);
    if (data.telegram_link) localStorage.setItem("telegram_link", data.telegram_link);
    if (data.email) localStorage.setItem("email", data.email);
    if (data.trial_days_left != null) {
      localStorage.setItem("trial_days_left", String(data.trial_days_left));
    }
  } catch {
    // localStorage недоступен — не ломаем вход
  }
}

export function clearSession() {
  try {
    localStorage.removeItem("company_id");
    localStorage.removeItem("business_name");
    localStorage.removeItem("telegram_link");
    localStorage.removeItem("email");
    localStorage.removeItem("trial_days_left");
  } catch {
    // ignore
  }
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Сервер ответил не JSON (код ${response.status}). Проверь, что Flask запущен: ${API_URL}`,
    );
  }
}

export const registerUser = async (email: string, password: string, business_name?: string) => {
  try {
    const response = await fetch(`${API_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password, business_name }),
    });

    const data = await readJson(response);

    if (!response.ok) {
      return { error: data.error || `Ошибка регистрации (${response.status})` };
    }

    saveSession(data);
    return data;
  } catch (err) {
    console.error("registerUser:", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      return {
        error: `Нет связи с Python (${API_URL}). Запусти app.py и открой сайт через http://localhost:5173`,
      };
    }
    return { error: msg };
  }
};

export const loginUser = async (email: string, password: string) => {
  try {
    const response = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    const data = await readJson(response);

    if (!response.ok) {
      return { error: data.error || `Ошибка входа (${response.status})` };
    }

    saveSession(data);
    return data;
  } catch (err) {
    console.error("loginUser:", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      return {
        error: `Нет связи с Python (${API_URL}). Запусти app.py и открой сайт через http://localhost:5173`,
      };
    }
    return { error: msg };
  }
};

export const logoutUser = async () => {
  try {
    await fetch(`${API_URL}/api/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // сервер недоступен — всё равно чистим локально
  } finally {
    clearSession();
  }
};
