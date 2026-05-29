import { redirect } from "next/navigation";

import { sanitizeRedirectTarget } from "../../lib/auth-guards";

export default function LoginPage({ searchParams }) {
  const nextSearchParams = new URLSearchParams();

  if (searchParams?.mode === "signup") {
    nextSearchParams.set("mode", "signup");
  }

  if (searchParams?.verified === "1") {
    nextSearchParams.set("verified", "1");
  }

  const redirectTo = sanitizeRedirectTarget(searchParams?.redirect, "");
  if (redirectTo) {
    nextSearchParams.set("redirect", redirectTo);
  }

  const query = nextSearchParams.toString();
  redirect(query ? `/?${query}` : "/");
}
