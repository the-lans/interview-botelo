// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DashboardPage from "../app/dashboard/page";
import * as api from "../lib/api";

const pushMock = vi.fn();
const replaceMock = vi.fn();

const progressPayload = {
  summary: {
    total_topics: 2,
    completed_topics: 1,
    completion_percent: 50,
    status_counts: {
      todo: 0,
      in_progress: 1,
      done: 1,
    },
  },
  topics: [
    { topic: "Python", status: "in_progress", updated_at: "2026-06-11T08:00:00Z" },
    { topic: "SQL", status: "done", updated_at: null },
  ],
  history: [
    { topic: "Python", status: "in_progress", updated_at: "2026-06-11T08:00:00Z" },
  ],
};

afterEach(() => {
  cleanup();
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

vi.mock("../lib/api", () => ({
  fetchProgress: vi.fn(),
  generatePlan: vi.fn(),
  ingestVacancy: vi.fn(),
  logout: vi.fn(),
  updateProgress: vi.fn(),
}));

describe("dashboard wizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchProgress.mockResolvedValue({
      summary: {
        total_topics: 0,
        completed_topics: 0,
        completion_percent: 0,
        status_counts: { todo: 0, in_progress: 0, done: 0 },
      },
      topics: [],
      history: [],
    });
    api.updateProgress.mockResolvedValue({ detail: "updated" });
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

  it("показывает пустой блок прогресса", async () => {
    render(<DashboardPage />);
    await waitFor(() => expect(api.fetchProgress).toHaveBeenCalledTimes(1));

    api.ingestVacancy.mockResolvedValue({ vacancy_text: "Python backend role" });
    await userEvent.type(screen.getByLabelText("Входные данные вакансии"), "text vacancy");
    await userEvent.click(screen.getByRole("button", { name: "Обработать вакансию" }));
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    await userEvent.type(screen.getByLabelText("Целевая роль *"), "Backend Engineer");
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    await userEvent.click(screen.getByRole("button", { name: "Сгенерировать план" }));

    expect(await screen.findByText("Пока нет тем прогресса.")).toBeInTheDocument();
  });

  it("обновляет статус темы и перезагружает прогресс", async () => {
    api.fetchProgress
      .mockResolvedValueOnce(progressPayload)
      .mockResolvedValueOnce(progressPayload)
      .mockResolvedValueOnce({
        ...progressPayload,
        summary: {
          total_topics: 2,
          completed_topics: 2,
          completion_percent: 100,
          status_counts: { todo: 0, in_progress: 0, done: 2 },
        },
        topics: [
          { topic: "Python", status: "done", updated_at: "2026-06-11T09:00:00Z" },
          { topic: "SQL", status: "done", updated_at: null },
        ],
        history: [
          { topic: "Python", status: "done", updated_at: "2026-06-11T09:00:00Z" },
          { topic: "Python", status: "in_progress", updated_at: "2026-06-11T08:00:00Z" },
        ],
      });

    render(<DashboardPage />);
    await waitFor(() => expect(api.fetchProgress).toHaveBeenCalledTimes(1));

    api.ingestVacancy.mockResolvedValue({ vacancy_text: "Python backend role" });
    api.generatePlan.mockResolvedValue({
      plan_id: 7,
      plan: { weeks: [{ week: 1, themes: ["Python", "SQL"] }] },
    });

    await userEvent.type(screen.getByLabelText("Входные данные вакансии"), "text vacancy");
    await userEvent.click(screen.getByRole("button", { name: "Обработать вакансию" }));
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    await userEvent.type(screen.getByLabelText("Целевая роль *"), "Backend Engineer");
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    await userEvent.click(screen.getByRole("button", { name: "Сгенерировать план" }));

    const select = await screen.findByLabelText("Статус темы Python");
    await userEvent.selectOptions(select, "done");

    await waitFor(() => expect(api.updateProgress).toHaveBeenCalledWith({ topic: "Python", status: "done" }));
    await waitFor(() => expect(api.fetchProgress).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("Статус темы «Python» обновлён.")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("показывает ошибку загрузки прогресса и кнопку повтора", async () => {
    api.fetchProgress.mockRejectedValueOnce(new Error("Network down")).mockRejectedValueOnce(new Error("Network down"));
    api.ingestVacancy.mockResolvedValue({ vacancy_text: "Python backend role" });
    api.generatePlan.mockResolvedValue({
      plan_id: 7,
      plan: { weeks: [{ week: 1, themes: ["Python", "SQL"] }] },
    });

    render(<DashboardPage />);

    expect(await screen.findByText("Network down")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Входные данные вакансии"), "text vacancy");
    await userEvent.click(screen.getByRole("button", { name: "Обработать вакансию" }));
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    await userEvent.type(screen.getByLabelText("Целевая роль *"), "Backend Engineer");
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    await userEvent.click(screen.getByRole("button", { name: "Сгенерировать план" }));

    expect(await screen.findByText("Не удалось загрузить прогресс.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });

  it("делает logout и редиректит на auth-first экран", async () => {
    api.logout.mockResolvedValue({ detail: "ok" });
    window.localStorage.setItem("dashboardDraftV1", JSON.stringify({ vacancyInput: "secret" }));
    render(<DashboardPage />);

    await userEvent.click(screen.getByRole("button", { name: "Выйти" }));

    await waitFor(() => expect(api.logout).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem("dashboardDraftV1")).toBeNull();
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("редиректит на auth-first экран при 401 от progress", async () => {
    api.fetchProgress.mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    render(<DashboardPage />);

    expect(await screen.findByText("Нужно войти, чтобы увидеть прогресс.")).toBeInTheDocument();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/?redirect=/dashboard"));
  });

  it("блокирует переход к генерации без целевой роли", async () => {
    api.ingestVacancy.mockResolvedValue({ vacancy_text: "Python backend role" });
    render(<DashboardPage />);

    await userEvent.type(screen.getByLabelText("Входные данные вакансии"), "text vacancy");
    await userEvent.click(screen.getByRole("button", { name: "Обработать вакансию" }));
    await waitFor(() => expect(api.ingestVacancy).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(screen.getByRole("heading", { name: "Шаг 2. Бриф подготовки" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Далее" })).toBeDisabled();
  });

  it("возвращает на вход при 401 во время обработки вакансии", async () => {
    api.ingestVacancy.mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    render(<DashboardPage />);

    await userEvent.type(screen.getByLabelText("Входные данные вакансии"), "text vacancy");
    await userEvent.click(screen.getByRole("button", { name: "Обработать вакансию" }));

    expect(await screen.findByText("Сессия истекла. Войдите снова, чтобы продолжить.")).toBeInTheDocument();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/?redirect=/dashboard"));
  });

  it("возвращает на вход при 401 во время генерации плана", async () => {
    api.ingestVacancy.mockResolvedValue({ vacancy_text: "Python backend role" });
    api.generatePlan.mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    render(<DashboardPage />);

    await userEvent.type(screen.getByLabelText("Входные данные вакансии"), "text vacancy");
    await userEvent.click(screen.getByRole("button", { name: "Обработать вакансию" }));
    await waitFor(() => expect(api.ingestVacancy).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    await userEvent.type(screen.getByLabelText("Целевая роль *"), "Backend Engineer");
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    await userEvent.click(screen.getByRole("button", { name: "Сгенерировать план" }));

    expect(await screen.findByText("Сессия истекла. Войдите снова, чтобы продолжить.")).toBeInTheDocument();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/?redirect=/dashboard"));
  });

  it("возвращает на вход при 401 во время обновления статуса темы", async () => {
    api.fetchProgress.mockResolvedValue(progressPayload);
    api.updateProgress.mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    api.generatePlan.mockResolvedValue({
      plan_id: 7,
      plan: { weeks: [{ week: 1, themes: ["Python", "SQL"] }] },
    });
    api.ingestVacancy.mockResolvedValue({ vacancy_text: "Python backend role" });

    render(<DashboardPage />);

    await userEvent.type(screen.getByLabelText("Входные данные вакансии"), "text vacancy");
    await userEvent.click(screen.getByRole("button", { name: "Обработать вакансию" }));
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    await userEvent.type(screen.getByLabelText("Целевая роль *"), "Backend Engineer");
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    await userEvent.click(screen.getByRole("button", { name: "Сгенерировать план" }));

    const select = await screen.findByLabelText("Статус темы Python");
    await userEvent.selectOptions(select, "done");

    expect(await screen.findByText("Сессия истекла. Войдите снова, чтобы продолжить.")).toBeInTheDocument();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/?redirect=/dashboard"));
  });
});
