import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/server-component-context";
import { SignOutButton } from "@/components/SignOutButton";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/incidents", label: "Incidents" },
  { href: "/evaluation", label: "Evaluation" },
  { href: "/about", label: "About" },
];

export async function NavBar() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-100">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-400" aria-hidden />
          AI Incident Investigator
        </Link>
        <div className="flex items-center gap-1 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-1.5 text-slate-300 transition-colors hover:bg-slate-800/70 hover:text-slate-50"
            >
              {link.label}
            </Link>
          ))}
          {user ? (
            <div className="ml-2 flex items-center gap-2 border-l border-slate-800 pl-3">
              <span className="text-xs text-slate-400">{user.email}</span>
              <SignOutButton />
            </div>
          ) : (
            <Link
              href="/login"
              className="ml-2 rounded-md border-l border-slate-800 px-3 py-1.5 pl-3 text-slate-300 transition-colors hover:bg-slate-800/70 hover:text-slate-50"
            >
              Log in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
