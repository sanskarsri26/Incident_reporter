export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">AI Production Incident Investigator</h1>
      <p className="text-slate-400">
        Select an incident, run an investigation, and review evidence-linked root causes.
      </p>
      <a className="text-sky-400 underline" href="/incidents">
        View incidents
      </a>
    </main>
  );
}
