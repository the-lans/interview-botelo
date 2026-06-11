import { describe, expect, it } from "vitest";

import {
  isProbablyValidSessionCookie,
  sanitizeRedirectTarget,
} from "../lib/auth-guards";

describe("auth guards", () => {
  it("разрешает только безопасные внутренние redirect", () => {
    expect(sanitizeRedirectTarget("/dashboard")).toBe("/dashboard");
    expect(sanitizeRedirectTarget("/dashboard?tab=plan")).toBe("/dashboard?tab=plan");
    expect(sanitizeRedirectTarget("//evil.com")).toBe("/dashboard");
    expect(sanitizeRedirectTarget("https://evil.com")).toBe("/dashboard");
    expect(sanitizeRedirectTarget(undefined)).toBe("/dashboard");
  });

  it("распознаёт валидную session cookie по структуре и exp", () => {
    const payload = Buffer.from(JSON.stringify({
      sub: "7",
      exp: Math.floor(Date.now() / 1000) + 3600,
    })).toString("base64url");
    const token = `header.${payload}.sig`;

    expect(isProbablyValidSessionCookie(token)).toBe(true);
    expect(isProbablyValidSessionCookie("garbage")).toBe(false);
  });

  it("отклоняет просроченную или неполную session cookie", () => {
    const expiredPayload = Buffer.from(JSON.stringify({
      sub: "7",
      exp: Math.floor(Date.now() / 1000) - 10,
    })).toString("base64url");
    const missingSubjectPayload = Buffer.from(JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + 3600,
    })).toString("base64url");

    expect(isProbablyValidSessionCookie(`header.${expiredPayload}.sig`)).toBe(false);
    expect(isProbablyValidSessionCookie(`header.${missingSubjectPayload}.sig`)).toBe(false);
  });
});
