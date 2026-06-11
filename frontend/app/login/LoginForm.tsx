"use client";

import React, { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

import { login, signup } from "@/lib/api";
import { sanitizeRedirectTarget } from "@/lib/auth-guards";
import type { ApiError } from "@/lib/types/api.types";
import { authCopy } from "@/lib/ui-copy";

type AuthMode = "login" | "signup";

interface LoginFormProps {
  initialMode?: AuthMode;
  redirectTo?: string;
  verified?: boolean;
}

function toApiError(error: unknown): ApiError {
  return error as ApiError;
}

export default function LoginForm({
  initialMode = "login",
  redirectTo = "/dashboard",
  verified = false,
}: LoginFormProps): JSX.Element {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const isLogin = mode === "login";
  const modeCopy = isLogin ? authCopy.modes.login : authCopy.modes.signup;

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setStatus("");
    setLoading(true);

    try {
      if (isLogin) {
        await login({ email, password });
        setStatus(authCopy.modes.login.success);
        router.push(sanitizeRedirectTarget(redirectTo));
      } else {
        await signup({ email, password });
        setStatus(authCopy.modes.signup.success);
        setMode("login");
      }
    } catch (unknownError) {
      const error = toApiError(unknownError);
      if (error.status === 403) {
        setStatus(authCopy.unverified);
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
        <p className="eyebrow">{authCopy.eyebrow}</p>
        <h1>{authCopy.title}</h1>
        <p className="muted">{authCopy.description}</p>
        <ul className="auth-highlights">
          {authCopy.highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <section className="card auth-card">
        <h2>{modeCopy.heading}</h2>
        <p className="muted">{modeCopy.description}</p>

        <div className="auth-switch" role="tablist" aria-label="Форма авторизации">
          <button
            type="button"
            role="tab"
            className={`auth-switch-button ${isLogin ? "active" : ""}`}
            onClick={() => {
              setMode("login");
              setStatus("");
            }}
            aria-selected={isLogin}
          >
            {authCopy.modes.login.heading}
          </button>
          <button
            type="button"
            role="tab"
            className={`auth-switch-button ${!isLogin ? "active" : ""}`}
            onClick={() => {
              setMode("signup");
              setStatus("");
            }}
            aria-selected={!isLogin}
          >
            {authCopy.modes.signup.heading}
          </button>
        </div>

        {verified && isLogin && (
          <p>
            <small>{authCopy.verified}</small>
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <label className="field">
            {authCopy.fields.email}
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="field">
            {authCopy.fields.password}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? modeCopy.loading : modeCopy.submit}
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
