// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LoginForm from "../app/login/LoginForm";
import * as api from "../lib/api";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("../lib/api", () => ({
  login: vi.fn(),
  signup: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe("auth flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("открывает регистрацию, если initialMode=signup", () => {
    render(<LoginForm initialMode="signup" />);

    expect(screen.getByRole("heading", { name: "Регистрация" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать аккаунт" })).toBeInTheDocument();
  });

  it("показывает флаг подтверждения email для login режима", () => {
    render(<LoginForm initialMode="login" verified />);

    expect(screen.getByText("Email подтверждён. Теперь можно войти.")).toBeInTheDocument();
  });

  it("логинит и редиректит в dashboard", async () => {
    api.login.mockResolvedValue({ detail: "ok" });
    render(<LoginForm initialMode="login" />);

    await userEvent.type(screen.getByLabelText("Email"), "user@test.com");
    await userEvent.type(screen.getByLabelText("Пароль"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));

    await waitFor(() => expect(api.login).toHaveBeenCalledWith({ email: "user@test.com", password: "secret" }));
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("регистрирует и возвращает в режим входа", async () => {
    api.signup.mockResolvedValue({ detail: "ok" });
    render(<LoginForm initialMode="signup" />);

    await userEvent.type(screen.getByLabelText("Email"), "new@test.com");
    await userEvent.type(screen.getByLabelText("Пароль"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Создать аккаунт" }));

    await waitFor(() => expect(api.signup).toHaveBeenCalledWith({ email: "new@test.com", password: "secret" }));
    expect(await screen.findByRole("heading", { name: "Вход" })).toBeInTheDocument();
  });
});
