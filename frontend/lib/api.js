const getApiBase = () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

function readCookie(name) {
  if (typeof document === "undefined") {
    return "";
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

async function request(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (!SAFE_METHODS.includes(method)) {
    const csrfToken = readCookie("csrf_token");
    if (csrfToken) {
      headers["x-csrf-token"] = csrfToken;
    }
  }

  const response = await fetch(`${getApiBase()}${path}`, {
    credentials: "include",
    headers,
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.detail || "Request failed";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

export function signup(payload) {
  return request("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function login(payload) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logout() {
  return request("/auth/logout", {
    method: "POST",
  });
}

export function fetchProgress() {
  return request("/progress", { method: "GET" });
}
