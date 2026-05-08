import React from "react";
import LoginForm from "./LoginForm";

export default function LoginPage({ searchParams }) {
  const mode = searchParams?.mode === "signup" ? "signup" : "login";
  const verified = searchParams?.verified === "1";

  return <LoginForm initialMode={mode} verified={verified} />;
}
