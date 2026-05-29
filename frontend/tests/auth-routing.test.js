import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("auth routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signup page редиректит на /?mode=signup", async () => {
    const { default: SignupPage } = await import("../app/signup/page");
    const { redirect } = await import("next/navigation");

    SignupPage();

    expect(redirect).toHaveBeenCalledWith("/?mode=signup");
  });

  it("login page редиректит на корень с query-параметрами", async () => {
    const { default: LoginPage } = await import("../app/login/page");
    const { redirect } = await import("next/navigation");

    LoginPage({
      searchParams: {
        mode: "signup",
        verified: "1",
        redirect: "/dashboard",
      },
    });

    expect(redirect).toHaveBeenCalledWith("/?mode=signup&verified=1&redirect=%2Fdashboard");
  });

  it("home page рендерит LoginForm с безопасным redirectTo", async () => {
    const { default: Home } = await import("../app/page");

    const element = Home({
      searchParams: {
        mode: "signup",
        verified: "1",
        redirect: "/dashboard",
      },
    });

    expect(element.props).toEqual(
      expect.objectContaining({ initialMode: "signup", redirectTo: "/dashboard", verified: true })
    );
  });
});
