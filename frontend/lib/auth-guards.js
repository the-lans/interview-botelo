const DEFAULT_REDIRECT = "/dashboard";
const INTERNAL_ORIGIN = "http://local.test";

export function sanitizeRedirectTarget(redirect, fallback = DEFAULT_REDIRECT) {
  if (typeof redirect !== "string" || !redirect.startsWith("/") || redirect.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(redirect, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  if (typeof atob === "function") {
    return atob(padded);
  }

  return Buffer.from(padded, "base64").toString("utf-8");
}

export function isProbablyValidSessionCookie(token) {
  if (typeof token !== "string") {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    const userId = Number(payload?.sub);
    const expiresAt = Number(payload?.exp);

    if (!Number.isInteger(userId) || userId <= 0) {
      return false;
    }

    if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
