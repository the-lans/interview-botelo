"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchProgress, logout } from "../../lib/api";

export default function DashboardPage() {
  const [progress, setProgress] = useState([]);
  const [status, setStatus] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
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
