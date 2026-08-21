import { FeedbackForm } from "@/components/FeedbackForm";

const REPO_URL = "https://github.com/sanskarsri26/Incident_reporter";

export default function AboutPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-slate-50">About</h1>
        <p className="mt-1 text-sm text-slate-400">
          A portfolio project exploring how far an AI-assisted incident investigator can go on a fully
          free deployment stack — while being honest about what&apos;s real and what&apos;s simulated.
        </p>
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-sm font-semibold text-slate-200">What this project does</h2>
        <p className="mt-2 text-sm text-slate-400">
          A user picks a simulated production incident, reviews its logs/metrics timeline, and clicks
          Investigate. The pipeline retrieves relevant runbooks and similar historical incidents (RAG),
          generates ranked root-cause candidates, verifies each candidate&apos;s evidence citations against
          what was actually retrieved, and produces a final root cause plus recommended actions — with
          every claim traceable back to a specific log line, metric point, document, or prior incident.
        </p>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-sm font-semibold text-slate-200">What&apos;s real vs. mock in this deployment</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4 font-medium">Component</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              <tr className="border-b border-slate-800/60">
                <td className="py-2 pr-4">Incident simulator, fault injection, dataset generation</td>
                <td className="py-2">Real — 56 labeled incidents across 8 fault types, generated and committed</td>
              </tr>
              <tr className="border-b border-slate-800/60">
                <td className="py-2 pr-4">Investigation pipeline (RAG retrieval, ranking, evidence linking)</td>
                <td className="py-2">Real logic — runs end-to-end against whichever providers are configured</td>
              </tr>
              <tr className="border-b border-slate-800/60">
                <td className="py-2 pr-4">LLM provider (root-cause generation, verification, actions)</td>
                <td className="py-2">
                  Mock by default (deterministic, seeded); swaps to real Gemini automatically when{" "}
                  <code className="rounded bg-slate-800 px-1 py-0.5 text-xs">GEMINI_API_KEY</code> is set
                </td>
              </tr>
              <tr className="border-b border-slate-800/60">
                <td className="py-2 pr-4">Embedding / retrieval provider</td>
                <td className="py-2">Mock by default; real Gemini embeddings when configured</td>
              </tr>
              <tr className="border-b border-slate-800/60">
                <td className="py-2 pr-4">Data storage</td>
                <td className="py-2">
                  In-memory repository by default (does not persist across process restarts); real Supabase
                  Postgres when <code className="rounded bg-slate-800 px-1 py-0.5 text-xs">SUPABASE_URL</code> /{" "}
                  <code className="rounded bg-slate-800 px-1 py-0.5 text-xs">SUPABASE_SERVICE_ROLE_KEY</code> are
                  set — real migrations are committed under{" "}
                  <code className="rounded bg-slate-800 px-1 py-0.5 text-xs">supabase/migrations/</code>
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Evaluation report</td>
                <td className="py-2">
                  Real numbers from an actual evaluation run — but against the mock provider baseline, not a
                  Gemini quality claim (see the Evaluation page&apos;s notes)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-sm font-semibold text-slate-200">Tech stack</h2>
        <ul className="mt-2 flex flex-wrap gap-2 text-xs">
          {[
            "Next.js 16 (App Router)",
            "TypeScript",
            "Tailwind CSS",
            "Recharts",
            "Zod",
            "Vitest",
            "Supabase (optional)",
            "Gemini API (optional)",
          ].map((tech) => (
            <li key={tech} className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-slate-300">
              {tech}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-sm font-semibold text-slate-200">Limitations</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-slate-400">
          <li>Incidents and logs are synthetic, generated by a fault-injection simulator — not real production data.</li>
          <li>Ranking scores are a transparent heuristic (evidence coverage, retrieval similarity, historical match, verifier agreement), not a calibrated probability of correctness.</li>
          <li>Without a Supabase connection, data resets whenever the server process restarts.</li>
          <li>Without a Gemini API key, all model output comes from a deterministic mock provider, not a real LLM.</li>
        </ul>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Source</h2>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs text-sky-400 hover:underline"
          >
            View on GitHub →
          </a>
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-sm font-semibold text-slate-200">Feedback</h2>
        <p className="mt-1 mb-3 text-xs text-slate-500">
          Notice something broken or have a suggestion? It&apos;s saved to the app&apos;s feedback log.
        </p>
        <FeedbackForm />
      </section>
    </main>
  );
}
