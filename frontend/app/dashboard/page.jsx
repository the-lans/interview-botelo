"use client";

import { useEffect, useState } from "react";
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

export default function DashboardPage() {
  const [progress, setProgress] = useState([]);
  const [status, setStatus] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [vacancyMode, setVacancyMode] = useState("raw_text");
  const [vacancyInput, setVacancyInput] = useState("");
  const [vacancyText, setVacancyText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [brief, setBrief] = useState(defaultBrief);
  const [planResult, setPlanResult] = useState(null);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    fetchProgress()
      .then((data) => {
        if (mounted) {
          setProgress(data);
        }
      })
      .catch((error) => {
        if (mounted) {
          if (error.status === 401) {
            setNeedsLogin(true);
            setStatus("Нужно войти, чтобы увидеть прогресс.");
          } else {
            setStatus(error.message);
          }
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = async () => {
    setStatus("");
    try {
      await logout();
      setStatus("Вы вышли из системы");
      router.push("/login");
    } catch (error) {
      setStatus(error.message);
    }
  };

  const handlePriorityChange = (value, checked) => {
    setBrief((prev) => ({
      ...prev,
      priorities: checked
        ? [...prev.priorities, value]
        : prev.priorities.filter((item) => item !== value),
    }));
  };

  const handleIngestVacancy = async () => {
    setStatus("");
    try {
      const payload = vacancyMode === "url" ? { url: vacancyInput } : { raw_text: vacancyInput };
      const response = await ingestVacancy(payload);
      setVacancyText(response.vacancy_text);
      setStatus("Текст вакансии успешно обработан");
    } catch (error) {
      setStatus(error.message);
    }
  };

  const handleGeneratePlan = async () => {
    setStatus("");
    setPlanResult(null);

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
      setStatus("План подготовки сгенерирован");
    } catch (error) {
      setStatus(error.message);
    }
  };

  return (
    <section className="card">
      <h1>Dashboard</h1>
      <button type="button" onClick={handleLogout}>
        Выйти
      </button>
      {status && <p><small>{status}</small></p>}
      {needsLogin && (
        <p>
          <a href="/login">Перейти к входу</a>
        </p>
      )}

      <h2>План подготовки</h2>
      <p><small>Бриф включает 8 полей (без дневного трекинга).</small></p>

      <label>
        Текст резюме (опционально, если уже загружено резюме)
        <textarea value={resumeText} onChange={(e) => setResumeText(e.target.value)} rows={4} />
      </label>

      <label>
        Источник вакансии
        <select value={vacancyMode} onChange={(e) => setVacancyMode(e.target.value)}>
          <option value="raw_text">Полный текст вакансии</option>
          <option value="url">Ссылка на вакансию</option>
        </select>
      </label>
      <textarea
        rows={4}
        value={vacancyInput}
        onChange={(e) => setVacancyInput(e.target.value)}
        placeholder={vacancyMode === "url" ? "https://..." : "Вставьте текст вакансии"}
      />
      <button type="button" onClick={handleIngestVacancy}>Обработать вакансию</button>

      <label>
        Целевая роль/позиция
        <input value={brief.target_role} onChange={(e) => setBrief({ ...brief, target_role: e.target.value })} />
      </label>

      <label>
        Уровень
        <select value={brief.level} onChange={(e) => setBrief({ ...brief, level: e.target.value })}>
          <option>Junior</option><option>Junior+</option><option>Middle</option><option>Middle+</option><option>Senior</option>
        </select>
      </label>

      <label>
        Горизонт подготовки
        <select
          value={brief.horizon_weeks}
          onChange={(e) => setBrief({ ...brief, horizon_weeks: Number(e.target.value) })}
        >
          <option value={2}>2 недели</option>
          <option value={4}>4 недели</option>
          <option value={6}>6 недель</option>
        </select>
      </label>

      <label>
        Часы в будни
        <input
          type="number"
          value={brief.weekday_hours}
          onChange={(e) => setBrief({ ...brief, weekday_hours: Number(e.target.value) })}
        />
      </label>

      <label>
        Часы в выходные
        <input
          type="number"
          value={brief.weekend_hours}
          onChange={(e) => setBrief({ ...brief, weekend_hours: Number(e.target.value) })}
        />
      </label>

      <label>
        Формат плана
        <select value={brief.plan_format} onChange={(e) => setBrief({ ...brief, plan_format: e.target.value })}>
          <option value="themes">темы</option>
          <option value="themes+practice">темы+практика</option>
          <option value="themes+practice+mock_interview">темы+практика+mock interview</option>
        </select>
      </label>

      <fieldset>
        <legend>Приоритеты</legend>
        {["Алгоритмы", "System Design", "Python Internals", "SQL", "Backend Architecture", "Поведенческая часть (behavioral)"]
          .map((item) => (
            <label key={item} style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={brief.priorities.includes(item)}
                onChange={(e) => handlePriorityChange(item, e.target.checked)}
              />
              {item}
            </label>
          ))}
        <label>
          Другое
          <input value={brief.other_priority} onChange={(e) => setBrief({ ...brief, other_priority: e.target.value })} />
        </label>
      </fieldset>

      <label>
        Ограничения/предпочтения
        <textarea value={brief.constraints} onChange={(e) => setBrief({ ...brief, constraints: e.target.value })} rows={3} />
      </label>

      <label>
        Язык подготовки
        <select value={brief.language} onChange={(e) => setBrief({ ...brief, language: e.target.value })}>
          <option value="RU">RU</option>
          <option value="EN">EN</option>
        </select>
      </label>

      <button type="button" onClick={handleGeneratePlan}>Сгенерировать план</button>

      {planResult && (
        <div>
          <h3>Результат (plan_id: {planResult.plan_id})</h3>
          <pre>{JSON.stringify(planResult.plan, null, 2)}</pre>
        </div>
      )}

      <h2>Прогресс</h2>
      {progress.length === 0 && <p><small>Пока нет данных.</small></p>}
      <ul>
        {progress.map((item) => (
          <li key={`${item.topic}-${item.updated_at}`}>
            {item.topic}: {item.status}
          </li>
        ))}
      </ul>
    </section>
  );
}
