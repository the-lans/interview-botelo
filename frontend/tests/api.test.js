import { afterEach, describe, expect, it, vi } from "vitest";

process.env.NEXT_PUBLIC_API_BASE = "http://test";

import { fetchProgress, generatePlan, ingestVacancy, login, logout, updateProgress } from "../lib/api";

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

  it("error exposes status", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({ detail: "Unauthorized" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    try {
      await fetchProgress();
    } catch (error) {
      expect(error.status).toBe(401);
    }
  });

  it("adds csrf token for non-GET requests", async () => {
    global.document = { cookie: "csrf_token=abc123" };
    const fetchSpy = mockFetch({ detail: "ok" });
    vi.stubGlobal("fetch", fetchSpy);

    await logout();

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test/auth/logout",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-csrf-token": "abc123" }),
      })
    );

    delete global.document;
  });

  it("fetchProgress returns progress payload", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        summary: { total_topics: 1, completed_topics: 0, completion_percent: 0, status_counts: { todo: 1, in_progress: 0, done: 0 } },
        topics: [{ topic: "Python", status: "todo", updated_at: null }],
        history: [],
      })
    );

    const data = await fetchProgress();

    expect(data.summary.total_topics).toBe(1);
    expect(data.topics[0].topic).toBe("Python");
  });

  it("updateProgress posts payload", async () => {
    const fetchSpy = mockFetch({
      detail: "updated",
      topic: { topic: "Python", status: "done", updated_at: "2026-06-11T08:00:00Z" },
    });
    vi.stubGlobal("fetch", fetchSpy);

    const data = await updateProgress({ topic: "Python", status: "done" });

    expect(data.detail).toBe("updated");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test/progress",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("ingestVacancy posts payload", async () => {
    const fetchSpy = mockFetch({ vacancy_text: "python" });
    vi.stubGlobal("fetch", fetchSpy);

    const data = await ingestVacancy({ raw_text: "python" });

    expect(data.vacancy_text).toBe("python");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test/vacancy/ingest",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("generatePlan posts payload", async () => {
    const fetchSpy = mockFetch({ detail: "ok", plan_id: 1, plan: { summary: "ok" } });
    vi.stubGlobal("fetch", fetchSpy);

    const data = await generatePlan({
      resume_text: "python",
      vacancy_text: "sql",
      brief: { target_role: "Backend", priorities: ["SQL"] },
    });

    expect(data.plan_id).toBe(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test/plan/generate",
      expect.objectContaining({ method: "POST" })
    );
  });
});
