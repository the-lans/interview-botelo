// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DashboardPage from "../app/dashboard/page";
import * as api from "../lib/api";
import type {
  GeneratePlanResponse,
  ProgressData,
  ProgressUpdateResponse,
  VacancyIngestResponse,
} from "../lib/types/api.types";

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
} satisfies ProgressData;

const generatedPlanResponse = {
  plan_id: 7,
  plan: { weeks: [{ week: 1, themes: ["Python", "SQL"] }] },
} satisfies GeneratePlanResponse;

const processedVacancyResponse = {
  vacancy_text: "Python backend role",
} satisfies VacancyIngestResponse;

async function moveToPlanResult(): Promise<void> {
  await userEvent.type(screen.getByLabelText("Входные данные вакансии"), "text vacancy");
  await userEvent.click(screen.getByRole("button", { name: "Обработать вакансию" }));
  await userEvent.click(screen.getByRole("button", { name: "Далее" }));
  await userEvent.type(screen.getByLabelText("Целевая роль *"), "Backend Engineer");
  await userEvent.click(screen.getByRole("button", { name: "Далее" }));
  await userEvent.click(screen.getByRole("button", { name: "Сгенерировать план" }));
}

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
    vi.mocked(api.fetchProgress).mockResolvedValue({
      summary: {
        total_topics: 0,
        completed_topics: 0,
        completion_percent: 0,
        status_counts: { todo: 0, in_progress: 0, done: 0 },
      },
      topics: [],
      history: [],
    });
    vi.mocked(api.updateProgress).mockResolvedValue({
      detail: "updated",
      topic: {
        topic: "Python",
        status: "done",
        updated_at: "2026-06-11T09:00:00Z",
      },
    } satisfies ProgressUpdateResponse);
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
    vi.mocked(api.ingestVacancy).mockResolvedValue(processedVacancyResponse);
    vi.mocked(api.generatePlan).mockResolvedValue(generatedPlanResponse);

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

    vi.mocked(api.ingestVacancy).mockResolvedValue(processedVacancyResponse);
    vi.mocked(api.generatePlan).mockResolvedValue(generatedPlanResponse);
    await moveToPlanResult();

    expect(await screen.findByText("Пока нет тем прогресса.")).toBeInTheDocument();
  });

  it("обновляет статус темы и перезагружает прогресс", async () => {
    const updatedProgressPayload = {
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
    } satisfies ProgressData;
    let fetchProgressCalls = 0;
    vi.mocked(api.fetchProgress).mockImplementation(async () => {
      fetchProgressCalls += 1;
      return fetchProgressCalls >= 3 ? updatedProgressPayload : progressPayload;
    });

    render(<DashboardPage />);
    await waitFor(() => expect(api.fetchProgress).toHaveBeenCalledTimes(1));

    vi.mocked(api.ingestVacancy).mockResolvedValue(processedVacancyResponse);
    vi.mocked(api.generatePlan).mockResolvedValue(generatedPlanResponse);

    await moveToPlanResult();

    const select = await screen.findByLabelText("Статус темы Python");
    await userEvent.selectOptions(select, "done");

    await waitFor(() => expect(api.updateProgress).toHaveBeenCalledWith({ topic: "Python", status: "done" }));
    expect(await screen.findByText("Статус темы «Python» обновлён.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("100%")).toBeInTheDocument());
  });

  it("делает logout и редиректит на auth-first экран", async () => {
    vi.mocked(api.logout).mockResolvedValue({ detail: "ok" });
    window.localStorage.setItem("dashboardDraftV1", JSON.stringify({ vacancyInput: "secret" }));
    render(<DashboardPage />);

    await userEvent.click(screen.getByRole("button", { name: "Выйти" }));

    await waitFor(() => expect(api.logout).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem("dashboardDraftV1")).toBeNull();
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("редиректит на auth-first экран при 401 от progress", async () => {
    vi.mocked(api.fetchProgress).mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 }),
    );
    render(<DashboardPage />);

    expect(await screen.findByText("Нужно войти, чтобы увидеть прогресс.")).toBeInTheDocument();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/?redirect=/dashboard"));
  });

  it("блокирует переход к генерации без целевой роли", async () => {
    vi.mocked(api.ingestVacancy).mockResolvedValue(processedVacancyResponse);
    render(<DashboardPage />);

    await userEvent.type(screen.getByLabelText("Входные данные вакансии"), "text vacancy");
    await userEvent.click(screen.getByRole("button", { name: "Обработать вакансию" }));
    await waitFor(() => expect(api.ingestVacancy).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(screen.getByRole("heading", { name: "Шаг 2. Бриф подготовки" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Далее" })).toBeDisabled();
  });

  it.each([
    {
      name: "во время обработки вакансии",
      setup: () => {
        vi.mocked(api.ingestVacancy).mockRejectedValue(
          Object.assign(new Error("Unauthorized"), { status: 401 }),
        );
      },
      act: async () => {
        await userEvent.type(screen.getByLabelText("Входные данные вакансии"), "text vacancy");
        await userEvent.click(screen.getByRole("button", { name: "Обработать вакансию" }));
      },
    },
    {
      name: "во время генерации плана",
      setup: () => {
        vi.mocked(api.ingestVacancy).mockResolvedValue(processedVacancyResponse);
        vi.mocked(api.generatePlan).mockRejectedValue(
          Object.assign(new Error("Unauthorized"), { status: 401 }),
        );
      },
      act: async () => {
        await userEvent.type(screen.getByLabelText("Входные данные вакансии"), "text vacancy");
        await userEvent.click(screen.getByRole("button", { name: "Обработать вакансию" }));
        await waitFor(() => expect(api.ingestVacancy).toHaveBeenCalledTimes(1));
        await userEvent.click(screen.getByRole("button", { name: "Далее" }));
        await userEvent.type(screen.getByLabelText("Целевая роль *"), "Backend Engineer");
        await userEvent.click(screen.getByRole("button", { name: "Далее" }));
        await userEvent.click(screen.getByRole("button", { name: "Сгенерировать план" }));
      },
    },
    {
      name: "во время обновления статуса темы",
      setup: () => {
        vi.mocked(api.fetchProgress).mockResolvedValue(progressPayload);
        vi.mocked(api.ingestVacancy).mockResolvedValue(processedVacancyResponse);
        vi.mocked(api.generatePlan).mockResolvedValue(generatedPlanResponse);
        vi.mocked(api.updateProgress).mockRejectedValue(
          Object.assign(new Error("Unauthorized"), { status: 401 }),
        );
      },
      act: async () => {
        await moveToPlanResult();
        const select = await screen.findByLabelText("Статус темы Python");
        await userEvent.selectOptions(select, "done");
      },
    },
  ])("возвращает на вход при 401 $name", async ({ act, setup }) => {
    setup();
    render(<DashboardPage />);

    await act();

    expect(await screen.findByText("Сессия истекла. Войдите снова, чтобы продолжить.")).toBeInTheDocument();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/?redirect=/dashboard"));
  });
});
