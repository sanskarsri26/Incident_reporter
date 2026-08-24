"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  async function handleClick() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-md px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-800/70 hover:text-slate-50"
    >
      Sign out
    </button>
  );
}
