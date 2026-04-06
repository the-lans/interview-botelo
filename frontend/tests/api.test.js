import { afterEach, describe, expect, it, vi } from "vitest";

process.env.NEXT_PUBLIC_API_BASE = "http://test";

import { fetchProgress, login } from "../lib/api";

const mockFetch = (payload, ok = true) =>
  vi.fn().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue(payload),
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api client", () => {
  it("login returns data on success", async () => {
    const fetchSpy = mockFetch({ detail: "ok" });
    vi.stubGlobal("fetch", fetchSpy);

    const data = await login({ email: "test@test.com", password: "secret" });

    expect(data.detail).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test/auth/login",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("login throws on error", async () => {
    vi.stubGlobal("fetch", mockFetch({ detail: "Invalid" }, false));

    await expect(login({ email: "a@b.com", password: "bad" })).rejects.toThrow(
      "Invalid"
    );
  });

  it("fetchProgress returns array", async () => {
    vi.stubGlobal("fetch", mockFetch([{ topic: "Python", status: "todo" }]));

    const data = await fetchProgress();

    expect(data).toHaveLength(1);
    expect(data[0].topic).toBe("Python");
  });
});
