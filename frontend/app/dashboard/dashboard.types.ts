import type {
  GeneratePlanResponse,
  PlanFormat,
  PlanLanguage,
  PlanLevel,
  ProgressData,
  ProgressStatus,
} from "@/lib/types/api.types";

export interface BriefFormState {
  target_role: string;
  level: PlanLevel;
  horizon_weeks: 2 | 4 | 6;
  weekday_hours: number;
  weekend_hours: number;
  plan_format: PlanFormat;
  priorities: string[];
  other_priority: string;
  constraints: string;
  language: PlanLanguage;
}

export interface DashboardDraft {
  vacancyMode: VacancyMode;
  vacancyInput: string;
  vacancyText: string;
  resumeText: string;
  brief: BriefFormState;
}

export type VacancyMode = "raw_text" | "url";
export type DashboardStatusType = "success" | "error" | "info" | "";

export interface DashboardStatus {
  type: DashboardStatusType;
  message: string;
}

export interface ProgressMetric {
  key: "total_topics" | "completed_topics" | ProgressStatus;
  value: number;
}

export interface DashboardState {
  currentStep: number;
  progressData: ProgressData;
  progressError: string;
  isProgressLoading: boolean;
  status: DashboardStatus;
  needsLogin: boolean;
  vacancyMode: VacancyMode;
  vacancyInput: string;
  vacancyText: string;
  resumeText: string;
  brief: BriefFormState;
  planResult: GeneratePlanResponse | null;
  isIngestLoading: boolean;
  isGenerateLoading: boolean;
  isLogoutLoading: boolean;
  updatingTopic: string;
}
