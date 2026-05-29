import { NextResponse } from "next/server";

import { isProbablyValidSessionCookie } from "./lib/auth-guards";

export function middleware(request) {
  if (!request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  const session = request.cookies.get("session")?.value;
  if (isProbablyValidSessionCookie(session)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/", request.url);
  loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
