import type {
  ApiError,
  AuthPayload,
  GeneratePlanPayload,
  GeneratePlanResponse,
  MessageResponse,
  ProgressData,
  ProgressUpdatePayload,
  ProgressUpdateResponse,
  VacancyIngestPayload,
  VacancyIngestResponse,
} from "./types/api.types";

const DEFAULT_API_BASE = "http://localhost:8000";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_COOKIE_NAME = "csrf_token";

type HttpMethod = "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions extends Omit<RequestInit, "method"> {
  method?: HttpMethod;
}

class RequestError extends Error implements ApiError {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE || DEFAULT_API_BASE;
}

function readCookie(name: string): string {
  if (typeof document === "undefined") {
    return "";
  }

  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function buildHeaders(options: RequestOptions): HeadersInit {
  const method = (options.method || "GET").toUpperCase() as HttpMethod;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (!SAFE_METHODS.has(method)) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) {
      headers["x-csrf-token"] = csrfToken;
    }
  }

  return headers;
}

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function request<TResponse>(
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> {
  const response = await fetch(`${getApiBase()}${path}`, {
    credentials: "include",
    ...options,
    headers: buildHeaders(options),
  });

  const data = await parseJsonResponse<{ detail?: string } & TResponse>(response);
  if (!response.ok) {
    throw new RequestError(data?.detail || "Request failed", response.status);
  }

  if (data === null) {
    throw new RequestError("Empty response body", response.status);
  }

  return data;
}

export function signup(payload: AuthPayload): Promise<MessageResponse> {
  return request<MessageResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function login(payload: AuthPayload): Promise<MessageResponse> {
  return request<MessageResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logout(): Promise<MessageResponse> {
  return request<MessageResponse>("/auth/logout", {
    method: "POST",
  });
}

export function fetchProgress(): Promise<ProgressData> {
  return request<ProgressData>("/progress", { method: "GET" });
}

export function updateProgress(
  payload: ProgressUpdatePayload,
): Promise<ProgressUpdateResponse> {
  return request<ProgressUpdateResponse>("/progress", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function ingestVacancy(
  payload: VacancyIngestPayload,
): Promise<VacancyIngestResponse> {
  return request<VacancyIngestResponse>("/vacancy/ingest", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function generatePlan(
  payload: GeneratePlanPayload,
): Promise<GeneratePlanResponse> {
  return request<GeneratePlanResponse>("/plan/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
