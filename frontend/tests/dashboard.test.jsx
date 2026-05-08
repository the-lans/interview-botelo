// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DashboardPage from "../app/dashboard/page";
import * as api from "../lib/api";

const pushMock = vi.fn();

afterEach(() => {
  cleanup();
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("../lib/api", () => ({
  fetchProgress: vi.fn(),
  generatePlan: vi.fn(),
  ingestVacancy: vi.fn(),
  logout: vi.fn(),
}));

describe("dashboard wizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchProgress.mockResolvedValue([]);
    window.localStorage.clear();
  });

  it("рендерит шаг 1 по умолчанию", async () => {
    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "Шаг 1. Резюме и вакансия" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Шаг 2. Бриф подготовки" })).not.toBeInTheDocument();

    await waitFor(() => expect(api.fetchProgress).toHaveBeenCalledTimes(1));
  });

  it("не пускает дальше без обработки вакансии", async () => {
    render(<DashboardPage />);

    expect(screen.getByRole("button", { name: "Далее" })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "Шаг 1. Резюме и вакансия" })).toBeInTheDocument();
  });

  it("проходит шаги и генерирует план", async () => {
    api.ingestVacancy.mockResolvedValue({ vacancy_text: "Python backend role" });
    api.generatePlan.mockResolvedValue({
      plan_id: 7,
      plan: { weeks: [{ week: 1, themes: ["Python", "SQL"] }] },
    });

    render(<DashboardPage />);

    await userEvent.type(screen.getByLabelText("Входные данные вакансии"), "text vacancy");
    await userEvent.click(screen.getByRole("button", { name: "Обработать вакансию" }));

    await waitFor(() => expect(api.ingestVacancy).toHaveBeenCalledWith({ raw_text: "text vacancy" }));

    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(screen.getByRole("heading", { name: "Шаг 2. Бриф подготовки" })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Целевая роль *"), "Backend Engineer");
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));

    expect(screen.getByRole("heading", { name: "Шаг 3. Генерация плана" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Сгенерировать план" }));

    await waitFor(() => expect(api.generatePlan).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "Шаг 4. Результат плана" })).toBeInTheDocument();
    expect(screen.getByText("Неделя 1")).toBeInTheDocument();
  });

  it("делает logout и редиректит на login", async () => {
    api.logout.mockResolvedValue({ detail: "ok" });
    render(<DashboardPage />);

    await userEvent.click(screen.getByRole("button", { name: "Выйти" }));

    await waitFor(() => expect(api.logout).toHaveBeenCalledTimes(1));
    expect(pushMock).toHaveBeenCalledWith("/login");
  });
});
