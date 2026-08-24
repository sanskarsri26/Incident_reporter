"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Login failed");
        return;
      }
      // Only follow same-origin, absolute-path "next" values — an unvalidated redirect target
      // would let ?next=https://evil.com send a just-authenticated user off-site.
      const next = searchParams.get("next");
      const safeNext =
        next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
          ? next
          : "/incidents";
      router.push(safeNext);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-email" className="text-xs font-medium text-slate-300">Email</label>
        <input
          id="login-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-password" className="text-xs font-medium text-slate-300">Password</label>
        <input
          id="login-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
        />
      </div>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
      >
        Log in
      </button>
    </form>
  );
}
