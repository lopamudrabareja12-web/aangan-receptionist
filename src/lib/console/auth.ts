import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "./session";

export async function isSignedIn(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(process.env.DASHBOARD_PASSWORD, token);
}

/** Every console page and every console action calls this first. No password configured means nobody gets in. */
export async function requireSignedIn(): Promise<void> {
  if (!(await isSignedIn())) redirect("/login");
}
