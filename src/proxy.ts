import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/console/session";

/** First gate for the console: no valid session cookie means a real redirect to the sign-in page, before anything renders. */
export function proxy(request: NextRequest) {
  if (verifySession(process.env.DASHBOARD_PASSWORD, request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = { matcher: "/console/:path*" };
