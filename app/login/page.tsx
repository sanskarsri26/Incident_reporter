import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-16">
      <h1 className="text-xl font-semibold text-slate-50">Log in</h1>
      <LoginForm />
      <p className="text-sm text-slate-400">
        No account? <Link href="/signup" className="text-sky-400 hover:underline">Sign up</Link>
      </p>
    </main>
  );
}
