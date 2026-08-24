import Link from "next/link";
import { SignupForm } from "@/components/SignupForm";

export default function SignupPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-16">
      <h1 className="text-xl font-semibold text-slate-50">Sign up</h1>
      <SignupForm />
      <p className="text-sm text-slate-400">
        Already have an account? <Link href="/login" className="text-sky-400 hover:underline">Log in</Link>
      </p>
    </main>
  );
}
