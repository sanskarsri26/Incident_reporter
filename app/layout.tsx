import type { Metadata } from "next";
import { NavBar } from "@/components/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Production Incident Investigator",
  description: "AI-assisted root-cause investigation for simulated production incidents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
