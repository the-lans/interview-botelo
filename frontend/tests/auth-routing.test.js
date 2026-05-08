import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("auth routing", () => {
  it("signup page редиректит на /login?mode=signup", async () => {
    const { default: SignupPage } = await import("../app/signup/page");
    const { redirect } = await import("next/navigation");

    SignupPage();

    expect(redirect).toHaveBeenCalledWith("/login?mode=signup");
  });

  it("login page прокидывает mode и verified в LoginForm", async () => {
    const { default: LoginPage } = await import("../app/login/page");

    const element = LoginPage({ searchParams: { mode: "signup", verified: "1" } });

    expect(element.props).toEqual(
      expect.objectContaining({ initialMode: "signup", verified: true })
    );
  });
});
