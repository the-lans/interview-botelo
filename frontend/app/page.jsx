import React from "react";

import LoginForm from "./login/LoginForm";
import { sanitizeRedirectTarget } from "../lib/auth-guards";

export default function Home({ searchParams }) {
  const mode = searchParams?.mode === "signup" ? "signup" : "login";
  const verified = searchParams?.verified === "1";
  const redirectTo = sanitizeRedirectTarget(searchParams?.redirect);

  return <LoginForm initialMode={mode} redirectTo={redirectTo} verified={verified} />;
}
