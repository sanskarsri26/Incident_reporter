import { NextResponse } from "next/server";

// No repository access, no rate limiting, no provider calls: this route
// exists purely so Vercel/uptime monitors can hit it cheaply with zero side
// effects and zero dependency on Supabase/Gemini being configured.
export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
