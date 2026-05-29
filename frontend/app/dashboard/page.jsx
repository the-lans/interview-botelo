"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchProgress, generatePlan, ingestVacancy, logout } from "../../lib/api";

const defaultBrief = {
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

const priorityOptions = [
  "Алгоритмы",
  "System Design",
  "Python Internals",
  "SQL",
  "Backend Architecture",
  "Поведенческая часть (behavioral)",
];

const statusTypeMap = {
  success: "alert-success",
  error: "alert-error",
  info: "alert-info",
};

const stepLabels = ["Резюме и вакансия", "Бриф", "Генерация", "Результат и прогресс"];
const DRAFT_KEY = "dashboardDraftV1";

export default function DashboardPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState([]);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [needsLogin, setNeedsLogin] = useState(false);
  const [vacancyMode, setVacancyMode] = useState("raw_text");
  const [vacancyInput, setVacancyInput] = useState("");
  const [vacancyText, setVacancyText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [brief, setBrief] = useState(defaultBrief);
  const [planResult, setPlanResult] = useState(null);
  const [isIngestLoading, setIsIngestLoading] = useState(false);
  const [isGenerateLoading, setIsGenerateLoading] = useState(false);
  const [isLogoutLoading, setIsLogoutLoading] = useState(false);
  const router = useRouter();

  const canMoveToBrief = useMemo(() => Boolean(vacancyText.trim()), [vacancyText]);
  const canMoveToGenerate = useMemo(() => Boolean(canMoveToBrief && brief.target_role.trim()), [canMoveToBrief, brief.target_role]);

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedDraftRaw = window.localStorage.getItem(DRAFT_KEY);
      if (!storedDraftRaw) {
        return;
      }

      const storedDraft = JSON.parse(storedDraftRaw);
      setVacancyMode(storedDraft.vacancyMode || "raw_text");
      setVacancyInput(storedDraft.vacancyInput || "");
      setVacancyText(storedDraft.vacancyText || "");
      setResumeText(storedDraft.resumeText || "");
      setBrief((prev) => ({
        ...prev,
        ...(storedDraft.brief || {}),
      }));
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payload = {
      vacancyMode,
      vacancyInput,
      vacancyText,
      resumeText,
      brief,
    };

    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  }, [vacancyMode, vacancyInput, vacancyText, resumeText, brief]);

  useEffect(() => {
    let mounted = true;
    fetchProgress()
      .then((data) => {
        if (mounted) {
          setProgress(data);
        }
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }

        if (error.status === 401) {
          setNeedsLogin(true);
          setStatus({ type: "info", message: "Нужно войти, чтобы увидеть прогресс." });
          router.replace("/?redirect=/dashboard");
          return;
        }

        setStatus({ type: "error", message: error.message || "Не удалось загрузить прогресс." });
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = async () => {
    setStatus({ type: "", message: "" });
    setIsLogoutLoading(true);
    try {
      await logout();
      setStatus({ type: "success", message: "Вы вышли из системы." });
      router.push("/");
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Не удалось выйти из системы." });
    } finally {
      setIsLogoutLoading(false);
    }
  };

  const handlePriorityChange = (value, checked) => {
    setBrief((prev) => ({
      ...prev,
      priorities: checked
        ? [...new Set([...prev.priorities, value])]
        : prev.priorities.filter((item) => item !== value),
    }));
  };

  const handleIngestVacancy = async () => {
    setStatus({ type: "", message: "" });
    if (!vacancyInput.trim()) {
      setStatus({ type: "error", message: "Заполните текст вакансии или ссылку." });
      return;
    }

    setIsIngestLoading(true);
    try {
      const payload = vacancyMode === "url" ? { url: vacancyInput } : { raw_text: vacancyInput };
      const response = await ingestVacancy(payload);
      setVacancyText(response.vacancy_text || "");
      setStatus({ type: "success", message: "Текст вакансии успешно обработан." });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Ошибка обработки вакансии." });
    } finally {
      setIsIngestLoading(false);
    }
  };

  const handleGeneratePlan = async () => {
    setStatus({ type: "", message: "" });
    setPlanResult(null);

    if (!canMoveToGenerate) {
      setStatus({
        type: "info",
        message: "Для генерации заполните целевую роль и обработайте вакансию.",
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
          horizon_weeks: Number(brief.horizon_weeks),
          time_availability: {
            weekday_hours: Number(brief.weekday_hours),
            weekend_hours: Number(brief.weekend_hours),
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
      setStatus({ type: "success", message: "План подготовки сгенерирован." });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Ошибка генерации плана." });
    } finally {
      setIsGenerateLoading(false);
    }
  };

  const goNext = () => {
    if (currentStep === 0 && !canMoveToBrief) {
      setStatus({ type: "info", message: "Сначала обработайте вакансию на шаге 1." });
      return;
    }

    if (currentStep === 1 && !canMoveToGenerate) {
      setStatus({ type: "info", message: "Заполните обязательное поле «Целевая роль»." });
      return;
    }

    setStatus({ type: "", message: "" });
    setCurrentStep((prev) => Math.min(prev + 1, maxUnlockedStep));
  };

  const goPrev = () => {
    setStatus({ type: "", message: "" });
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  return (
    <section className="dashboard">
      <header className="card section header-section">
        <div>
          <h1>Dashboard подготовки</h1>
          <p className="muted">Проходите шаги последовательно: данные → бриф → генерация → результат.</p>
        </div>
        <button type="button" onClick={handleLogout} disabled={isLogoutLoading}>
          {isLogoutLoading ? "Выходим..." : "Выйти"}
        </button>
      </header>

      <div className="card section">
        <h2>Шаги подготовки</h2>
        <div className="stepper" role="tablist" aria-label="Шаги dashboard">
          {stepLabels.map((label, index) => {
            const disabled = index > maxUnlockedStep;
            return (
              <button
                key={label}
                type="button"
                className={`stepper-item ${index === currentStep ? "active" : ""}`}
                onClick={() => setCurrentStep(index)}
                disabled={disabled}
                aria-selected={index === currentStep}
              >
                <span className="step-number">{index + 1}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {status.message && (
        <div className={`alert ${statusTypeMap[status.type] || "alert-info"}`} role="status" aria-live="polite">
          {status.message}
        </div>
      )}

      {needsLogin && (
        <div className="card section">
          <a href="/?redirect=/dashboard">Перейти к входу</a>
        </div>
      )}

      {currentStep === 0 && (
        <div className="card section">
          <h2>Шаг 1. Резюме и вакансия</h2>
          <div className="field">
            <label htmlFor="resume-text">Текст резюме (опционально)</label>
            <textarea
              id="resume-text"
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              rows={5}
              placeholder="Вставьте резюме, если хотите уточнить персональные рекомендации"
            />
          </div>

          <div className="field-grid">
            <div className="field">
              <label htmlFor="vacancy-source">Источник вакансии</label>
              <select id="vacancy-source" value={vacancyMode} onChange={(e) => setVacancyMode(e.target.value)}>
                <option value="raw_text">Полный текст вакансии</option>
                <option value="url">Ссылка на вакансию</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="vacancy-input">Входные данные вакансии</label>
            <textarea
              id="vacancy-input"
              rows={5}
              value={vacancyInput}
              onChange={(e) => setVacancyInput(e.target.value)}
              placeholder={vacancyMode === "url" ? "https://..." : "Вставьте текст вакансии"}
            />
          </div>

          <button type="button" onClick={handleIngestVacancy} disabled={isIngestLoading}>
            {isIngestLoading ? "Обрабатываем..." : "Обработать вакансию"}
          </button>

          <div className="field">
            <label htmlFor="vacancy-processed">Обработанный текст вакансии</label>
            <textarea id="vacancy-processed" rows={5} value={vacancyText} readOnly placeholder="Появится после обработки" />
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <div className="card section">
          <h2>Шаг 2. Бриф подготовки</h2>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="target-role">Целевая роль *</label>
              <input
                id="target-role"
                value={brief.target_role}
                onChange={(e) => setBrief({ ...brief, target_role: e.target.value })}
                placeholder="Backend Engineer"
              />
            </div>

            <div className="field">
              <label htmlFor="level">Уровень</label>
              <select id="level" value={brief.level} onChange={(e) => setBrief({ ...brief, level: e.target.value })}>
                <option>Junior</option>
                <option>Junior+</option>
                <option>Middle</option>
                <option>Middle+</option>
                <option>Senior</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="horizon">Горизонт подготовки</label>
              <select
                id="horizon"
                value={brief.horizon_weeks}
                onChange={(e) => setBrief({ ...brief, horizon_weeks: Number(e.target.value) })}
              >
                <option value={2}>2 недели</option>
                <option value={4}>4 недели</option>
                <option value={6}>6 недель</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="plan-format">Формат плана</label>
              <select
                id="plan-format"
                value={brief.plan_format}
                onChange={(e) => setBrief({ ...brief, plan_format: e.target.value })}
              >
                <option value="themes">темы</option>
                <option value="themes+practice">темы+практика</option>
                <option value="themes+practice+mock_interview">темы+практика+mock interview</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="weekday-hours">Часы в будни</label>
              <input
                id="weekday-hours"
                type="number"
                min={0}
                value={brief.weekday_hours}
                onChange={(e) => setBrief({ ...brief, weekday_hours: Number(e.target.value) })}
              />
            </div>

            <div className="field">
              <label htmlFor="weekend-hours">Часы в выходные</label>
              <input
                id="weekend-hours"
                type="number"
                min={0}
                value={brief.weekend_hours}
                onChange={(e) => setBrief({ ...brief, weekend_hours: Number(e.target.value) })}
              />
            </div>

            <div className="field">
              <label htmlFor="language">Язык подготовки</label>
              <select id="language" value={brief.language} onChange={(e) => setBrief({ ...brief, language: e.target.value })}>
                <option value="RU">RU</option>
                <option value="EN">EN</option>
              </select>
            </div>
          </div>

          <fieldset className="priority-fieldset">
            <legend>Приоритеты</legend>
            <div className="priority-grid">
              {priorityOptions.map((item) => (
                <label key={item} className="priority-item">
                  <input
                    type="checkbox"
                    checked={brief.priorities.includes(item)}
                    onChange={(e) => handlePriorityChange(item, e.target.checked)}
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field-grid">
            <div className="field">
              <label htmlFor="other-priority">Другое (опционально)</label>
              <input
                id="other-priority"
                value={brief.other_priority}
                onChange={(e) => setBrief({ ...brief, other_priority: e.target.value })}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="constraints">Ограничения и предпочтения</label>
            <textarea
              id="constraints"
              value={brief.constraints}
              onChange={(e) => setBrief({ ...brief, constraints: e.target.value })}
              rows={4}
            />
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="card section">
          <h2>Шаг 3. Генерация плана</h2>
          <p className="muted">Минимум для запуска: обработанная вакансия и целевая роль.</p>
          <button type="button" onClick={handleGeneratePlan} disabled={!canMoveToGenerate || isGenerateLoading}>
            {isGenerateLoading ? "Генерируем..." : "Сгенерировать план"}
          </button>
        </div>
      )}

      {currentStep === 3 && (
        <>
          <div className="card section">
            <h2>Шаг 4. Результат плана</h2>
            {!planResult && <p className="muted">После генерации здесь появится структура плана.</p>}
            {planResult && (
              <div className="plan-result">
                <p>
                  <strong>Plan ID:</strong> {planResult.plan_id || "-"}
                </p>

                {Array.isArray(planResult?.plan?.weeks) && planResult.plan.weeks.length > 0 ? (
                  <div className="plan-list">
                    {planResult.plan.weeks.map((week, index) => (
                      <div key={week.week || index} className="plan-item">
                        <h3>Неделя {week.week || index + 1}</h3>
                        {Array.isArray(week.themes) && week.themes.length > 0 ? (
                          <ul>
                            {week.themes.map((topic) => (
                              <li key={topic}>{topic}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="muted">Темы не указаны.</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <pre>{JSON.stringify(planResult.plan, null, 2)}</pre>
                )}
              </div>
            )}
          </div>

          <div className="card section">
            <h2>Прогресс</h2>
            {progress.length === 0 ? (
              <div className="empty-state">
                <p>Пока нет записей прогресса.</p>
                <p className="muted">Сгенерируйте план и начните отмечать выполнение шагов.</p>
              </div>
            ) : (
              <ul className="progress-list">
                {progress.map((item) => (
                  <li key={`${item.topic}-${item.updated_at}`} className="progress-item">
                    <span>{item.topic}</span>
                    <span className="status-badge">{item.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <div className="wizard-actions">
        <button type="button" onClick={goPrev} disabled={currentStep === 0}>
          Назад
        </button>
        <button type="button" onClick={goNext} disabled={currentStep >= maxUnlockedStep}>
          Далее
        </button>
      </div>
    </section>
  );
}
