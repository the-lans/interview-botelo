"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function DashboardPage() {
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

  const canGeneratePlan = useMemo(() => {
    return Boolean(vacancyText.trim() && brief.target_role.trim());
  }, [vacancyText, brief.target_role]);

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
      router.push("/login");
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

    if (!canGeneratePlan) {
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
      setStatus({ type: "success", message: "План подготовки сгенерирован." });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Ошибка генерации плана." });
    } finally {
      setIsGenerateLoading(false);
    }
  };

  return (
    <section className="dashboard">
      <header className="card section header-section">
        <div>
          <h1>Dashboard подготовки</h1>
          <p className="muted">Соберите данные, сгенерируйте план и отслеживайте прогресс по шагам.</p>
        </div>
        <button type="button" onClick={handleLogout} disabled={isLogoutLoading}>
          {isLogoutLoading ? "Выходим..." : "Выйти"}
        </button>
      </header>

      {status.message && (
        <div className={`alert ${statusTypeMap[status.type] || "alert-info"}`} role="status" aria-live="polite">
          {status.message}
        </div>
      )}

      {needsLogin && (
        <div className="card section">
          <a href="/login">Перейти к входу</a>
        </div>
      )}

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

      <div className="card section">
        <h2>Шаг 2. Бриф подготовки</h2>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="target-role">Целевая роль</label>
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

      <div className="card section">
        <h2>Шаг 3. Генерация плана</h2>
        <p className="muted">Минимум для запуска: обработанная вакансия и целевая роль.</p>
        <button type="button" onClick={handleGeneratePlan} disabled={!canGeneratePlan || isGenerateLoading}>
          {isGenerateLoading ? "Генерируем..." : "Сгенерировать план"}
        </button>
      </div>

      <div className="card section">
        <h2>Результат плана</h2>
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
                    {Array.isArray(week.topics) && week.topics.length > 0 ? (
                      <ul>
                        {week.topics.map((topic) => (
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
    </section>
  );
}
