"use client";

import React from "react";
import { useSearchParams } from "next/navigation";

import LoginForm from "./LoginForm";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const mode = searchParams?.get("mode") === "signup" ? "signup" : "login";
  const verified = searchParams?.get("verified") === "1";

  return <LoginForm initialMode={mode} verified={verified} />;
}
