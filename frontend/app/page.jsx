import React from "react";

import LoginForm from "./login/LoginForm";

export default function Home({ searchParams }) {
  const mode = searchParams?.mode === "signup" ? "signup" : "login";
  const verified = searchParams?.verified === "1";
  const redirectTo = typeof searchParams?.redirect === "string" && searchParams.redirect.startsWith("/")
    ? searchParams.redirect
    : "/dashboard";

  return <LoginForm initialMode={mode} redirectTo={redirectTo} verified={verified} />;
}
