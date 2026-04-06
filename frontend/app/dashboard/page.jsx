"use client";

import { useEffect, useState } from "react";
import { fetchProgress, logout } from "../../lib/api";

export default function DashboardPage() {
  const [progress, setProgress] = useState([]);
  const [status, setStatus] = useState("");

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
          setStatus(error.message);
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
