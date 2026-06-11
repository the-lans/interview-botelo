// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProgressSection } from "../app/dashboard/components/ProgressSection";
import { defaultProgressData } from "../app/dashboard/dashboard.config";
import type { ProgressMetric } from "../app/dashboard/dashboard.types";
import type { ProgressData } from "../lib/types/api.types";

const progressMetrics: ProgressMetric[] = [
  { key: "total_topics", value: 2 },
  { key: "completed_topics", value: 1 },
  { key: "todo", value: 0 },
  { key: "in_progress", value: 1 },
  { key: "done", value: 1 },
];

const progressData = {
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

afterEach(() => {
  cleanup();
});

describe("progress section", () => {
  it("показывает ошибку загрузки и даёт повторить запрос", async () => {
    const retry = vi.fn();

    render(
      <ProgressSection
        isLoading={false}
        needsLogin={false}
        progressData={defaultProgressData}
        progressError="Network down"
        progressMetrics={progressMetrics}
        updatingTopic=""
        onRetry={retry}
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Не удалось загрузить прогресс.")).toBeInTheDocument();
    expect(screen.getByText("Network down")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("рендерит темы и отдаёт изменение статуса наружу", async () => {
    const onStatusChange = vi.fn();

    render(
      <ProgressSection
        isLoading={false}
        needsLogin={false}
        progressData={progressData}
        progressError=""
        progressMetrics={progressMetrics}
        updatingTopic=""
        onRetry={vi.fn()}
        onStatusChange={onStatusChange}
      />,
    );

    expect(screen.getByRole("heading", { name: "Python" })).toBeInTheDocument();
    expect(screen.getByText("История изменений")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Статус темы Python"), "done");

    expect(onStatusChange).toHaveBeenCalledWith("Python", "done");
  });
});
