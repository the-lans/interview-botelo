"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import LoginForm from "./LoginForm";

function LoginPageContent() {
  const searchParams = useSearchParams();
  const mode = searchParams?.get("mode") === "signup" ? "signup" : "login";
  const verified = searchParams?.get("verified") === "1";

  return <LoginForm initialMode={mode} verified={verified} />;
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}
