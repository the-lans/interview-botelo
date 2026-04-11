"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "../../lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setVerified(params.get("verified") === "1");
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus("");
    setLoading(true);
    try {
      await login({ email, password });
      setStatus("Успешный вход");
      router.push("/dashboard");
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
    <section className="card">
      <h1>Вход</h1>
      {verified && <p><small>Email подтверждён. Теперь можно войти.</small></p>}
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
          {loading ? "Входим..." : "Войти"}
        </button>
      </form>
      {status && <p><small>{status}</small></p>}
    </section>
  );
}
