import LoginForm from "./login-form";

export const metadata = { title: "Sign in | Aangan Studio", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Aangan console</h1>
      <p className="mt-1 text-sm text-zinc-500">For Nikhil and the front desk. Caller details are private.</p>
      <LoginForm />
    </main>
  );
}
