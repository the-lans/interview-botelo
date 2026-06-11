"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  fetchProgress,
  generatePlan,
  ingestVacancy,
  logout,
  updateProgress,
} from "@/lib/api";
import type { ApiError, ProgressData, ProgressStatus } from "@/lib/types/api.types";

import {
  DRAFT_KEY,
  defaultBrief,
  defaultProgressData,
} from "../dashboard.config";
import { dashboardCopy } from "../dashboard.copy";
import type {
  BriefFormState,
  DashboardDraft,
  DashboardState,
  ProgressMetric,
  VacancyMode,
} from "../dashboard.types";

interface LoadProgressOptions {
  silent?: boolean;
  unauthorizedMessage?: string;
  errorMessage?: string;
}

interface UseDashboardResult {
  state: DashboardState;
  canMoveToBrief: boolean;
  canMoveToGenerate: boolean;
  maxUnlockedStep: number;
  progressMetrics: ProgressMetric[];
  setCurrentStep: (step: number) => void;
  setVacancyMode: (mode: VacancyMode) => void;
  setVacancyInput: (value: string) => void;
  setResumeText: (value: string) => void;
  setBrief: (updater: BriefFormState | ((prev: BriefFormState) => BriefFormState)) => void;
  loadProgress: (options?: LoadProgressOptions) => Promise<ProgressData | null>;
  handleLogout: () => Promise<void>;
  handlePriorityChange: (value: string, checked: boolean) => void;
  handleIngestVacancy: () => Promise<void>;
  handleGeneratePlan: () => Promise<void>;
  handleProgressStatusChange: (
    topic: string,
    nextStatus: ProgressStatus,
  ) => Promise<void>;
  goNext: () => void;
  goPrev: () => void;
}

function buildDraft(
  vacancyMode: VacancyMode,
  vacancyInput: string,
  vacancyText: string,
  resumeText: string,
  brief: BriefFormState,
): DashboardDraft {
  return {
    vacancyMode,
    vacancyInput,
    vacancyText,
    resumeText,
    brief,
  };
}

function readDraft(): DashboardDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawDraft = window.localStorage.getItem(DRAFT_KEY);
    if (!rawDraft) {
      return null;
    }
    return JSON.parse(rawDraft) as DashboardDraft;
  } catch {
    return null;
  }
}

function toApiError(error: unknown): ApiError {
  return error as ApiError;
}

export function useDashboard(): UseDashboardResult {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [progressData, setProgressData] = useState(defaultProgressData);
  const [progressError, setProgressError] = useState("");
  const [isProgressLoading, setIsProgressLoading] = useState(true);
  const [status, setStatus] = useState<DashboardState["status"]>({
    type: "",
    message: "",
  });
  const [needsLogin, setNeedsLogin] = useState(false);
  const [vacancyMode, setVacancyMode] = useState<VacancyMode>("raw_text");
  const [vacancyInput, setVacancyInput] = useState("");
  const [vacancyText, setVacancyText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [brief, setBriefState] = useState<BriefFormState>(defaultBrief);
  const [planResult, setPlanResult] = useState<DashboardState["planResult"]>(null);
  const [isIngestLoading, setIsIngestLoading] = useState(false);
  const [isGenerateLoading, setIsGenerateLoading] = useState(false);
  const [isLogoutLoading, setIsLogoutLoading] = useState(false);
  const [updatingTopic, setUpdatingTopic] = useState("");

  const canMoveToBrief = useMemo(
    () => Boolean(vacancyText.trim()),
    [vacancyText],
  );
  const canMoveToGenerate = useMemo(
    () => Boolean(canMoveToBrief && brief.target_role.trim()),
    [brief.target_role, canMoveToBrief],
  );

  const maxUnlockedStep = useMemo(() => {
    if (!canMoveToBrief) {
      return 0;
    }
    if (!canMoveToGenerate) {
      return 1;
    }
    if (!planResult) {
      return 2;
    }
    return 3;
  }, [canMoveToBrief, canMoveToGenerate, planResult]);

  const progressMetrics = useMemo<ProgressMetric[]>(
    () => [
      { key: "total_topics", value: progressData.summary.total_topics },
      { key: "completed_topics", value: progressData.summary.completed_topics },
      { key: "todo", value: progressData.summary.status_counts.todo },
      { key: "in_progress", value: progressData.summary.status_counts.in_progress },
      { key: "done", value: progressData.summary.status_counts.done },
    ],
    [progressData],
  );

  useEffect(() => {
    const storedDraft = readDraft();
    if (!storedDraft) {
      return;
    }

    setVacancyMode(storedDraft.vacancyMode || "raw_text");
    setVacancyInput(storedDraft.vacancyInput || "");
    setVacancyText(storedDraft.vacancyText || "");
    setResumeText(storedDraft.resumeText || "");
    setBriefState((prev) => ({
      ...prev,
      ...storedDraft.brief,
    }));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payload = buildDraft(
      vacancyMode,
      vacancyInput,
      vacancyText,
      resumeText,
      brief,
    );
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  }, [brief, resumeText, vacancyInput, vacancyMode, vacancyText]);

  const redirectToLogin = useCallback((message: string): void => {
    setNeedsLogin(true);
    setStatus({ type: "info", message });
    router.replace("/?redirect=/dashboard");
  }, [router]);

  const loadProgress = useCallback(async (
    options: LoadProgressOptions = {},
  ): Promise<ProgressData | null> => {
    const { errorMessage, silent = false, unauthorizedMessage } = options;
    if (!silent) {
      setIsProgressLoading(true);
      setProgressError("");
    }

    try {
      const data = await fetchProgress();
      setNeedsLogin(false);
      setProgressData(data);
      setProgressError("");
      return data;
    } catch (unknownError) {
      const error = toApiError(unknownError);
      if (error.status === 401) {
        setProgressData(defaultProgressData);
        setProgressError("");
        redirectToLogin(
          unauthorizedMessage || dashboardCopy.messages.loadProgressUnauthorized,
        );
        return null;
      }

      const message =
        error.message || errorMessage || dashboardCopy.messages.progressLoadFailed;
      setProgressError(message);
      if (!silent) {
        setStatus({ type: "error", message });
      }
      return null;
    } finally {
      if (!silent) {
        setIsProgressLoading(false);
      }
    }
  }, [redirectToLogin]);

  useEffect(() => {
    void loadProgress({
      unauthorizedMessage: dashboardCopy.messages.loadProgressUnauthorized,
    });
  }, [loadProgress]);

  const setBrief = (
    updater: BriefFormState | ((prev: BriefFormState) => BriefFormState),
  ): void => {
    setBriefState((prev) =>
      typeof updater === "function" ? updater(prev) : updater,
    );
  };

  const handleLogout = async (): Promise<void> => {
    setStatus({ type: "", message: "" });
    setIsLogoutLoading(true);
    try {
      await logout();
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(DRAFT_KEY);
      }
      setStatus({ type: "success", message: dashboardCopy.messages.loggedOut });
      router.push("/");
    } catch (unknownError) {
      const error = toApiError(unknownError);
      setStatus({
        type: "error",
        message: error.message || dashboardCopy.messages.logoutError,
      });
    } finally {
      setIsLogoutLoading(false);
    }
  };

  const handlePriorityChange = (value: string, checked: boolean): void => {
    setBrief((prev) => ({
      ...prev,
      priorities: checked
        ? [...new Set([...prev.priorities, value])]
        : prev.priorities.filter((item) => item !== value),
    }));
  };

  const handleIngestVacancy = async (): Promise<void> => {
    setStatus({ type: "", message: "" });
    if (!vacancyInput.trim()) {
      setStatus({ type: "error", message: dashboardCopy.messages.fillVacancy });
      return;
    }

    setIsIngestLoading(true);
    try {
      const payload =
        vacancyMode === "url"
          ? { url: vacancyInput }
          : { raw_text: vacancyInput };
      const response = await ingestVacancy(payload);
      setVacancyText(response.vacancy_text || "");
      setStatus({ type: "success", message: dashboardCopy.messages.vacancySuccess });
    } catch (unknownError) {
      const error = toApiError(unknownError);
      if (error.status === 401) {
        redirectToLogin(dashboardCopy.messages.sessionExpired);
        return;
      }
      setStatus({
        type: "error",
        message: error.message || dashboardCopy.messages.vacancyError,
      });
    } finally {
      setIsIngestLoading(false);
    }
  };

  const handleGeneratePlan = async (): Promise<void> => {
    setStatus({ type: "", message: "" });
    setPlanResult(null);

    if (!canMoveToGenerate) {
      setStatus({
        type: "info",
        message: dashboardCopy.messages.generateGuard,
      });
      return;
    }

    setIsGenerateLoading(true);
    try {
      const response = await generatePlan({
        resume_text: resumeText || undefined,
        vacancy_text: vacancyText,
        brief: {
          target_role: brief.target_role,
          level: brief.level,
          horizon_weeks: brief.horizon_weeks,
          time_availability: {
            weekday_hours: brief.weekday_hours,
            weekend_hours: brief.weekend_hours,
          },
          plan_format: brief.plan_format,
          priorities: brief.priorities,
          other_priority: brief.other_priority || undefined,
          constraints: brief.constraints || undefined,
          language: brief.language,
        },
      });
      setPlanResult(response);
      setCurrentStep(3);
      setStatus({ type: "success", message: dashboardCopy.messages.planSuccess });
      await loadProgress({
        silent: true,
        unauthorizedMessage: dashboardCopy.messages.sessionExpired,
      });
    } catch (unknownError) {
      const error = toApiError(unknownError);
      if (error.status === 401) {
        redirectToLogin(dashboardCopy.messages.sessionExpired);
        return;
      }
      setStatus({
        type: "error",
        message: error.message || dashboardCopy.messages.planError,
      });
    } finally {
      setIsGenerateLoading(false);
    }
  };

  const handleProgressStatusChange = async (
    topic: string,
    nextStatus: ProgressStatus,
  ): Promise<void> => {
    setStatus({ type: "", message: "" });
    setUpdatingTopic(topic);
    try {
      await updateProgress({ topic, status: nextStatus });
      await loadProgress({
        silent: true,
        unauthorizedMessage: dashboardCopy.messages.sessionExpired,
      });
      setStatus({
        type: "success",
        message: `Статус темы «${topic}» обновлён.`,
      });
    } catch (unknownError) {
      const error = toApiError(unknownError);
      if (error.status === 401) {
        redirectToLogin(dashboardCopy.messages.sessionExpired);
        return;
      }
      setStatus({
        type: "error",
        message: error.message || dashboardCopy.messages.progressUpdateError,
      });
    } finally {
      setUpdatingTopic("");
    }
  };

  const goNext = (): void => {
    if (currentStep === 0 && !canMoveToBrief) {
      setStatus({
        type: "info",
        message: dashboardCopy.messages.processVacancyFirst,
      });
      return;
    }

    if (currentStep === 1 && !canMoveToGenerate) {
      setStatus({
        type: "info",
        message: dashboardCopy.messages.targetRoleRequired,
      });
      return;
    }

    setStatus({ type: "", message: "" });
    setCurrentStep((prev) => Math.min(prev + 1, maxUnlockedStep));
  };

  const goPrev = (): void => {
    setStatus({ type: "", message: "" });
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  return {
    state: {
      brief,
      currentStep,
      isGenerateLoading,
      isIngestLoading,
      isLogoutLoading,
      isProgressLoading,
      needsLogin,
      planResult,
      progressData,
      progressError,
      resumeText,
      status,
      updatingTopic,
      vacancyInput,
      vacancyMode,
      vacancyText,
    },
    canMoveToBrief,
    canMoveToGenerate,
    goNext,
    goPrev,
    handleGeneratePlan,
    handleIngestVacancy,
    handleLogout,
    handlePriorityChange,
    handleProgressStatusChange,
    loadProgress,
    maxUnlockedStep,
    progressMetrics,
    setBrief,
    setCurrentStep,
    setResumeText,
    setVacancyInput,
    setVacancyMode,
  };
}
