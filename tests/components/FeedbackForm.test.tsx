// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeedbackForm } from "@/components/FeedbackForm";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 201): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe("FeedbackForm", () => {
  it("rejects an empty message without ever calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<FeedbackForm />);
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByText("Feedback message can't be empty.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits the trimmed message, incidentId, and rating, then shows a confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ feedback: { id: "F1" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<FeedbackForm incidentId="INC-1" />);
    await user.type(screen.getByPlaceholderText(/Thoughts on this project/), "  great tool  ");
    await user.click(screen.getByRole("button", { name: "Rate 4 stars" }));
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(screen.getByText(/Thanks/)).toBeTruthy());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/feedback");
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ incidentId: "INC-1", message: "great tool", rating: 4 });
  });

  it("toggling the same star rating off sends rating: null", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ feedback: { id: "F1" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<FeedbackForm />);
    await user.type(screen.getByPlaceholderText(/Thoughts on this project/), "feedback text");
    await user.click(screen.getByRole("button", { name: "Rate 3 stars" }));
    await user.click(screen.getByRole("button", { name: "Rate 3 stars" })); // toggle off
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).rating).toBeNull();
  });

  it("shows the server's error message on a non-ok response instead of a generic failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Request body too large" }, 413)));
    const user = userEvent.setup();

    render(<FeedbackForm />);
    await user.type(screen.getByPlaceholderText(/Thoughts on this project/), "x".repeat(10));
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByText("Request body too large")).toBeTruthy();
  });

  it("shows a network-error message when fetch itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const user = userEvent.setup();

    render(<FeedbackForm />);
    await user.type(screen.getByPlaceholderText(/Thoughts on this project/), "feedback text");
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByText(/Network error/)).toBeTruthy();
  });
});
