import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseSearchParams = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useSearchParams: mockUseSearchParams,
}));

describe("auth routing", () => {
  beforeEach(() => {
    mockUseSearchParams.mockReset();
  });

  it("signup page редиректит на /login?mode=signup", async () => {
    const { default: SignupPage } = await import("../app/signup/page");
    const { redirect } = await import("next/navigation");

    SignupPage();

    expect(redirect).toHaveBeenCalledWith("/login?mode=signup");
  });

  it("login page прокидывает mode и verified в LoginForm", async () => {
    mockUseSearchParams.mockReturnValue({
      get: (key) => ({ mode: "signup", verified: "1" }[key] ?? null),
    });

    const { default: LoginPage } = await import("../app/login/page");

    const element = LoginPage();

    expect(element.props).toEqual(
      expect.objectContaining({ initialMode: "signup", verified: true })
    );
  });
});
