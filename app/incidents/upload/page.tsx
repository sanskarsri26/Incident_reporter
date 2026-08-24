import { UploadIncidentForm } from "@/components/UploadIncidentForm";

export default function UploadIncidentPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-slate-50">Upload an incident</h1>
        <p className="mt-1 text-sm text-slate-400">
          Bring your own error log. It&apos;s investigated the same way as the demo dataset, and only
          you can see it.
        </p>
      </div>
      <UploadIncidentForm />
    </main>
  );
}
