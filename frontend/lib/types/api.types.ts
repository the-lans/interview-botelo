export type ProgressStatus = "todo" | "in_progress" | "done";

export interface ApiError extends Error {
  status?: number;
}

export interface AuthPayload {
  email: string;
  password: string;
}

export interface MessageResponse {
  detail: string;
}

export interface ProgressTopic {
  topic: string;
  status: ProgressStatus;
  updated_at: string | null;
}

export interface ProgressHistoryEntry {
  topic: string;
  status: ProgressStatus;
  updated_at: string;
}

export interface ProgressStatusCounts {
  todo: number;
  in_progress: number;
  done: number;
}

export interface ProgressSummary {
  total_topics: number;
  completed_topics: number;
  completion_percent: number;
  status_counts: ProgressStatusCounts;
}

export interface ProgressData {
  summary: ProgressSummary;
  topics: ProgressTopic[];
  history: ProgressHistoryEntry[];
}

export interface ProgressUpdatePayload {
  topic: string;
  status: ProgressStatus;
}

export interface ProgressUpdateResponse {
  detail: "created" | "updated" | "unchanged";
  topic: ProgressTopic;
}

export interface VacancyIngestPayload {
  url?: string;
  raw_text?: string;
}

export interface VacancyIngestResponse {
  vacancy_text: string;
}

export interface TimeAvailability {
  weekday_hours: number;
  weekend_hours: number;
}

export type PlanLevel = "Junior" | "Junior+" | "Middle" | "Middle+" | "Senior";
export type PlanFormat = "themes" | "themes+practice" | "themes+practice+mock_interview";
export type PlanLanguage = "RU" | "EN";

export interface PlanBriefPayload {
  target_role: string;
  level: PlanLevel;
  horizon_weeks: 2 | 4 | 6;
  time_availability: TimeAvailability;
  plan_format: PlanFormat;
  priorities: string[];
  other_priority?: string;
  constraints?: string;
  language: PlanLanguage;
}

export interface GeneratePlanPayload {
  resume_text?: string;
  vacancy_text: string;
  brief: PlanBriefPayload;
}

export interface PlanWeek {
  week: number;
  themes: string[];
  practice?: string[];
  mock_interview?: string[];
  expected_outcome?: string;
  time_budget_hours?: number;
}

export interface GeneratedPlan {
  summary?: string;
  gap_analysis?: string[];
  weeks?: PlanWeek[];
  final_readiness_check?: string[];
}

export interface GeneratePlanResponse {
  detail?: string;
  plan_id: number;
  plan: GeneratedPlan;
}
