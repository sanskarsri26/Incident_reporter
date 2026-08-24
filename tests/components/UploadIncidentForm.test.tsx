// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadIncidentForm } from "@/components/UploadIncidentForm";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  pushMock.mockClear();
});

function jsonResponse(body: unknown, status = 201): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe("UploadIncidentForm", () => {
  it("submits title and log file as multipart form data, then navigates to the new incident", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ incident: { id: "INC-NEW" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<UploadIncidentForm />);
    await user.type(screen.getByLabelText("Title"), "Checkout errors spiking");
    const file = new File(['{"timestamp":"2026-01-01T00:00:00.000Z","service":"api","level":"error","message":"x"}'], "app.log", {
      type: "text/plain",
    });
    await user.upload(screen.getByLabelText("Log file"), file);
    await user.click(screen.getByRole("button", { name: "Upload and investigate" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/incidents/INC-NEW"));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/incidents/upload");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("shows the server's line-numbered error on a malformed upload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Invalid entry on line 2: Invalid datetime" }, 400)));
    const user = userEvent.setup();

    render(<UploadIncidentForm />);
    await user.type(screen.getByLabelText("Title"), "Bad file");
    const file = new File(["bad"], "app.log", { type: "text/plain" });
    await user.upload(screen.getByLabelText("Log file"), file);
    await user.click(screen.getByRole("button", { name: "Upload and investigate" }));

    expect(await screen.findByText("Invalid entry on line 2: Invalid datetime")).toBeTruthy();
  });

  it("rejects submission without a log file, without ever calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<UploadIncidentForm />);
    await user.type(screen.getByLabelText("Title"), "No file");
    await user.click(screen.getByRole("button", { name: "Upload and investigate" }));

    expect(await screen.findByText("Choose a log file to upload.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
