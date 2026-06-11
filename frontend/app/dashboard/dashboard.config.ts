import type { ProgressData, ProgressStatus } from "@/lib/types/api.types";

import type { BriefFormState, DashboardStatusType } from "./dashboard.types";

export const DRAFT_KEY = "dashboardDraftV1";
export const DISPLAY_TIME_ZONE = "UTC";

export const defaultBrief: BriefFormState = {
  target_role: "",
  level: "Middle",
  horizon_weeks: 4,
  weekday_hours: 2,
  weekend_hours: 4,
  plan_format: "themes+practice",
  priorities: ["Алгоритмы"],
  other_priority: "",
  constraints: "",
  language: "RU",
};

export const defaultProgressData: ProgressData = {
  summary: {
    total_topics: 0,
    completed_topics: 0,
    completion_percent: 0,
    status_counts: {
      todo: 0,
      in_progress: 0,
      done: 0,
    },
  },
  topics: [],
  history: [],
};

export const priorityOptions = [
  "Алгоритмы",
  "System Design",
  "Python Internals",
  "SQL",
  "Backend Architecture",
  "Поведенческая часть (behavioral)",
] as const;

export const progressStatusOptions: Array<{ value: ProgressStatus; label: string }> = [
  { value: "todo", label: "К изучению" },
  { value: "in_progress", label: "В процессе" },
  { value: "done", label: "Готово" },
];

export const progressStatusLabels: Record<ProgressStatus, string> = {
  todo: "К изучению",
  in_progress: "В процессе",
  done: "Готово",
};

export const progressMetricLabels: Record<
  "total_topics" | "completed_topics" | ProgressStatus,
  string
> = {
  total_topics: "Всего тем",
  completed_topics: "Завершено",
  todo: "К изучению",
  in_progress: "В процессе",
  done: "Готово",
};

export const statusTypeMap: Record<Exclude<DashboardStatusType, "">, string> = {
  success: "alert-success",
  error: "alert-error",
  info: "alert-info",
};
