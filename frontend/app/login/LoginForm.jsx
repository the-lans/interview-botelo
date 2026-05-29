"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { login, signup } from "../../lib/api";

export default function LoginForm({ initialMode = "login", redirectTo = "/dashboard", verified = false }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const isLogin = mode === "login";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus("");
    setLoading(true);

    try {
      if (isLogin) {
        await login({ email, password });
        setStatus("Успешный вход");
        router.push(redirectTo);
      } else {
        await signup({ email, password });
        setStatus("Проверьте почту и подтвердите email, затем войдите.");
        setMode("login");
      }
    } catch (error) {
      if (error.status === 403) {
        setStatus("Подтвердите email, затем войдите.");
      } else {
        setStatus(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-layout">
      <div className="auth-copy">
        <p className="eyebrow">Interview Botelo</p>
        <h1>Подготовка к интервью без хаоса</h1>
        <p className="muted">
          Войдите, чтобы пройти подготовку по шагам: вакансия, бриф, генерация плана и отслеживание прогресса.
        </p>
        <ul className="auth-highlights">
          <li>Один экран для входа и регистрации</li>
          <li>Пошаговый dashboard только после авторизации</li>
          <li>Сохранение черновика и понятные статусы действий</li>
        </ul>
      </div>

      <section className="card auth-card">
        <h2>{isLogin ? "Вход" : "Регистрация"}</h2>
        <p className="muted">{isLogin ? "Войдите, чтобы продолжить подготовку." : "Создайте аккаунт и подтвердите email."}</p>

        <div className="auth-switch" role="tablist" aria-label="Форма авторизации">
          <button
            type="button"
            className={`auth-switch-button ${isLogin ? "active" : ""}`}
            onClick={() => {
              setMode("login");
              setStatus("");
            }}
            aria-selected={isLogin}
          >
            Вход
          </button>
          <button
            type="button"
            className={`auth-switch-button ${!isLogin ? "active" : ""}`}
            onClick={() => {
              setMode("signup");
              setStatus("");
            }}
            aria-selected={!isLogin}
          >
            Регистрация
          </button>
        </div>

        {verified && isLogin && (
          <p>
            <small>Email подтверждён. Теперь можно войти.</small>
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <label className="field">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="field">
            Пароль
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? (isLogin ? "Входим..." : "Создаём аккаунт...") : isLogin ? "Войти" : "Создать аккаунт"}
          </button>
        </form>

        {status && (
          <p>
            <small>{status}</small>
          </p>
        )}
      </section>
    </section>
  );
}
