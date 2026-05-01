// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("dashboard: UI smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchProgress.mockResolvedValue([]);
  });

  it("рендерит ключевые секции страницы", async () => {
    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "Dashboard подготовки" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Шаг 1. Резюме и вакансия" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Шаг 2. Бриф подготовки" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Шаг 3. Генерация плана" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Результат плана" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Прогресс" })).toBeInTheDocument();

    await waitFor(() => expect(api.fetchProgress).toHaveBeenCalledTimes(1));
  });

  it("показывает пустой прогресс", async () => {
    render(<DashboardPage />);
    expect(await screen.findByText("Пока нет записей прогресса.")).toBeInTheDocument();
  });
});

describe("dashboard: пользовательский флоу", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchProgress.mockResolvedValue([]);
  });

  it("обрабатывает вакансию и генерирует план", async () => {
    api.ingestVacancy.mockResolvedValue({ vacancy_text: "Python backend role" });
    api.generatePlan.mockResolvedValue({
      plan_id: 7,
      plan: {
        weeks: [{ week: 1, themes: ["Python", "SQL"] }],
      },
    });

    render(<DashboardPage />);

    await userEvent.type(screen.getByLabelText("Входные данные вакансии"), "text vacancy");
    await userEvent.click(screen.getByRole("button", { name: "Обработать вакансию" }));

    await waitFor(() => expect(api.ingestVacancy).toHaveBeenCalledWith({ raw_text: "text vacancy" }));
    expect(screen.getByDisplayValue("Python backend role")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Целевая роль"), "Backend Engineer");
    await userEvent.click(screen.getByRole("button", { name: "Сгенерировать план" }));

    await waitFor(() => expect(api.generatePlan).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Plan ID:")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
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

describe("dashboard: валидация формы", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchProgress.mockResolvedValue([]);
  });

  it("не обрабатывает вакансию без текста", async () => {
    render(<DashboardPage />);

    await userEvent.click(screen.getByRole("button", { name: "Обработать вакансию" }));

    expect(api.ingestVacancy).not.toHaveBeenCalled();
    expect(screen.getByText("Заполните текст вакансии или ссылку.")).toBeInTheDocument();
  });

  it("блокирует генерацию без обязательных данных", async () => {
    render(<DashboardPage />);

    const generateButton = screen.getByRole("button", { name: "Сгенерировать план" });
    expect(generateButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Целевая роль"), { target: { value: "Backend" } });
    expect(generateButton).toBeDisabled();
  });
});

describe("dashboard: компонентные сценарии", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("показывает ссылку на login при 401 прогресса", async () => {
    api.fetchProgress.mockRejectedValue({ status: 401, message: "Unauthorized" });

    render(<DashboardPage />);

    expect(await screen.findByText("Нужно войти, чтобы увидеть прогресс.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти к входу" })).toBeInTheDocument();
  });

  it("показывает ошибку при падении ingest", async () => {
    api.fetchProgress.mockResolvedValue([]);
    api.ingestVacancy.mockRejectedValue(new Error("Ошибка обработки"));

    render(<DashboardPage />);

    await userEvent.type(screen.getByLabelText("Входные данные вакансии"), "some text");
    await userEvent.click(screen.getByRole("button", { name: "Обработать вакансию" }));

    expect(await screen.findByText("Ошибка обработки")).toBeInTheDocument();
  });

  it("показывает fallback JSON, если weeks не массив", async () => {
    api.fetchProgress.mockResolvedValue([]);
    api.ingestVacancy.mockResolvedValue({ vacancy_text: "vacancy" });
    api.generatePlan.mockResolvedValue({
      plan_id: 3,
      plan: { summary: "ok", raw: true },
    });

    render(<DashboardPage />);

    await userEvent.type(screen.getByLabelText("Входные данные вакансии"), "vacancy text");
    await userEvent.click(screen.getByRole("button", { name: "Обработать вакансию" }));
    await userEvent.type(screen.getByLabelText("Целевая роль"), "Backend");
    await userEvent.click(screen.getByRole("button", { name: "Сгенерировать план" }));

    expect(await screen.findByText(/"summary": "ok"/)).toBeInTheDocument();
  });
});
