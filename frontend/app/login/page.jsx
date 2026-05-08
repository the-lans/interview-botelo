"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { login, signup } from "../../lib/api";

export default function LoginPage({ searchParams }) {
  const initialMode = searchParams?.mode === "signup" ? "signup" : "login";
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const router = useRouter();

  const isLogin = useMemo(() => mode === "login", [mode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setVerified(params.get("verified") === "1");
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus("");
    setLoading(true);

    try {
      if (isLogin) {
        await login({ email, password });
        setStatus("Успешный вход");
        router.push("/dashboard");
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
    <section className="card auth-card">
      <h1>{isLogin ? "Вход" : "Регистрация"}</h1>
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
  );
}
