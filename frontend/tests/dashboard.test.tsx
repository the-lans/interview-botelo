// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
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

async function moveToPlanResult(user: UserEvent): Promise<void> {
  await user.type(screen.getByLabelText("Входные данные вакансии"), "text vacancy");
  await user.click(screen.getByRole("button", { name: "Обработать вакансию" }));
  await user.click(screen.getByRole("button", { name: "Далее" }));
  await user.type(screen.getByLabelText("Целевая роль *"), "Backend Engineer");
  await user.click(screen.getByRole("button", { name: "Далее" }));
  await user.click(screen.getByRole("button", { name: "Сгенерировать план" }));
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
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
    vi.resetAllMocks();
    pushMock.mockReset();
    replaceMock.mockReset();
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

  it("редиректит на вход при 401 во время начальной загрузки прогресса", async () => {
    vi.mocked(api.fetchProgress).mockRejectedValue({
      status: 401,
      message: "Unauthorized",
    });

    render(<DashboardPage />);

    expect(
      await screen.findByText("Нужно войти, чтобы увидеть прогресс."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Перейти к входу")).toBeInTheDocument();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/?redirect=/dashboard"));
  });

  it("не пускает дальше без обработки вакансии", async () => {
    render(<DashboardPage />);

    expect(screen.getByRole("button", { name: "Далее" })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "Шаг 1. Резюме и вакансия" })).toBeInTheDocument();
  });

  it("проходит шаги и генерирует план", async () => {
    const user = userEvent.setup();
    vi.mocked(api.ingestVacancy).mockResolvedValue(processedVacancyResponse);
    vi.mocked(api.generatePlan).mockResolvedValue(generatedPlanResponse);

    render(<DashboardPage />);

    await user.type(screen.getByLabelText("Входные данные вакансии"), "text vacancy");
    await user.click(screen.getByRole("button", { name: "Обработать вакансию" }));

    await waitFor(() => expect(api.ingestVacancy).toHaveBeenCalledWith({ raw_text: "text vacancy" }));

    await user.click(screen.getByRole("button", { name: "Далее" }));
    expect(screen.getByRole("heading", { name: "Шаг 2. Бриф подготовки" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Целевая роль *"), "Backend Engineer");
    await user.click(screen.getByRole("button", { name: "Далее" }));

    expect(screen.getByRole("heading", { name: "Шаг 3. Генерация плана" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Сгенерировать план" }));

    await waitFor(() => expect(api.generatePlan).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "Шаг 4. Результат плана" })).toBeInTheDocument();
    expect(screen.getByText("Неделя 1")).toBeInTheDocument();
  });

  it("показывает пустой блок прогресса", async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);
    await waitFor(() => expect(api.fetchProgress).toHaveBeenCalledTimes(1));

    vi.mocked(api.ingestVacancy).mockResolvedValue(processedVacancyResponse);
    vi.mocked(api.generatePlan).mockResolvedValue(generatedPlanResponse);
    await moveToPlanResult(user);

    expect(await screen.findByText("Пока нет тем прогресса.")).toBeInTheDocument();
  });

  it("после генерации плана молча перезагружает прогресс", async () => {
    const user = userEvent.setup();
    let fetchProgressCalls = 0;
    vi.mocked(api.fetchProgress).mockImplementation(async () => {
      fetchProgressCalls += 1;
      return fetchProgressCalls >= 2
        ? progressPayload
        : {
            summary: {
              total_topics: 0,
              completed_topics: 0,
              completion_percent: 0,
              status_counts: { todo: 0, in_progress: 0, done: 0 },
            },
            topics: [],
            history: [],
          };
    });
    vi.mocked(api.ingestVacancy).mockResolvedValue(processedVacancyResponse);
    vi.mocked(api.generatePlan).mockResolvedValue(generatedPlanResponse);

    render(<DashboardPage />);
    await waitFor(() => expect(api.fetchProgress).toHaveBeenCalledTimes(1));

    await moveToPlanResult(user);

    expect(await screen.findByRole("heading", { name: "Python" })).toBeInTheDocument();
    await waitFor(() => expect(fetchProgressCalls).toBeGreaterThan(1));
  });

  it("обновляет статус темы и перезагружает прогресс", async () => {
    const user = userEvent.setup();
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

    await moveToPlanResult(user);

    const select = await screen.findByLabelText("Статус темы Python");
    await user.selectOptions(select, "done");

    await waitFor(() => expect(api.updateProgress).toHaveBeenCalledWith({ topic: "Python", status: "done" }));
    expect(await screen.findByText("Статус темы «Python» обновлён.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("100%")).toBeInTheDocument());
  });

  it("редиректит на вход, если обновление прогресса вернуло 401", async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchProgress).mockResolvedValue(progressPayload);
    vi.mocked(api.ingestVacancy).mockResolvedValue(processedVacancyResponse);
    vi.mocked(api.generatePlan).mockResolvedValue(generatedPlanResponse);
    vi.mocked(api.updateProgress).mockRejectedValue({
      status: 401,
      message: "Unauthorized",
    });

    render(<DashboardPage />);
    await waitFor(() => expect(api.fetchProgress).toHaveBeenCalledTimes(1));

    await moveToPlanResult(user);
    await user.selectOptions(await screen.findByLabelText("Статус темы Python"), "done");

    expect(
      await screen.findByText("Сессия истекла. Войдите снова, чтобы продолжить."),
    ).toBeInTheDocument();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/?redirect=/dashboard"));
  });

});
