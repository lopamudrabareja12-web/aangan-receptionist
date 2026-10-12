"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, SESSION_COOKIE, sessionToken } from "@/lib/console/session";

export async function login(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return { error: "The console is not set up yet: DASHBOARD_PASSWORD is missing." };
  await new Promise((r) => setTimeout(r, 600)); // slows down guessing
  if (!checkPassword(expected, String(formData.get("password") ?? ""))) return { error: "That password is not right." };
  (await cookies()).set(SESSION_COOKIE, sessionToken(expected), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12,
  });
  redirect("/console");
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
