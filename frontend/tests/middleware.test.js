import { beforeEach, describe, expect, it, vi } from "vitest";

const nextMock = vi.fn(() => ({ type: "next" }));
const redirectMock = vi.fn((url) => ({ type: "redirect", url: url.toString() }));

vi.mock("next/server", () => ({
  NextResponse: {
    next: nextMock,
    redirect: redirectMock,
  },
}));

describe("middleware auth gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("пропускает dashboard только с валидной session cookie", async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const payload = Buffer.from(JSON.stringify({ sub: "1", exp: futureExp })).toString("base64url");
    const { middleware } = await import("../middleware");

    const response = middleware({
      nextUrl: { pathname: "/dashboard" },
      cookies: { get: () => ({ value: `h.${payload}.s` }) },
      url: "http://localhost/dashboard",
    });

    expect(nextMock).toHaveBeenCalled();
    expect(response).toEqual({ type: "next" });
  });

  it("редиректит при битой session cookie", async () => {
    const { middleware } = await import("../middleware");

    const response = middleware({
      nextUrl: { pathname: "/dashboard" },
      cookies: { get: () => ({ value: "broken" }) },
      url: "http://localhost/dashboard",
    });

    expect(redirectMock).toHaveBeenCalled();
    expect(response).toEqual({ type: "redirect", url: "http://localhost/?redirect=%2Fdashboard" });
  });
});
