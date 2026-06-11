import React from "react";

import LoginForm from "./login/LoginForm";
import { sanitizeRedirectTarget } from "../lib/auth-guards";

interface HomePageProps {
  searchParams?: {
    mode?: string;
    redirect?: string;
    verified?: string;
  };
}

export default function Home({
  searchParams,
}: HomePageProps): JSX.Element {
  const mode = searchParams?.mode === "signup" ? "signup" : "login";
  const verified = searchParams?.verified === "1";
  const redirectTo = sanitizeRedirectTarget(searchParams?.redirect);

  return (
    <LoginForm
      initialMode={mode}
      redirectTo={redirectTo}
      verified={verified}
    />
  );
}
