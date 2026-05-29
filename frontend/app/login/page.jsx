import { redirect } from "next/navigation";

export default function LoginPage({ searchParams }) {
  const nextSearchParams = new URLSearchParams();

  if (searchParams?.mode === "signup") {
    nextSearchParams.set("mode", "signup");
  }

  if (searchParams?.verified === "1") {
    nextSearchParams.set("verified", "1");
  }

  if (typeof searchParams?.redirect === "string" && searchParams.redirect.startsWith("/")) {
    nextSearchParams.set("redirect", searchParams.redirect);
  }

  const query = nextSearchParams.toString();
  redirect(query ? `/?${query}` : "/");
}
