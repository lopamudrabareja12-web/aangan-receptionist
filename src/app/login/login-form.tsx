"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="mt-6 space-y-3">
      <label className="block text-sm font-medium" htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900" />
      {state?.error ? <p role="alert" className="text-sm text-rose-700">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900">
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
