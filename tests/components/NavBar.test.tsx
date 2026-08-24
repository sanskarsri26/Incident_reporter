// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NavBar } from "@/components/NavBar";

vi.mock("@/lib/auth/server-component-context", () => ({
  getCurrentUser: vi.fn(),
}));
import { getCurrentUser } from "@/lib/auth/server-component-context";

// SignOutButton (rendered when signed in) calls next/navigation's
// useRouter(), which throws outside an app router context -- mock it the
// same way LoginForm.test.tsx/SignupForm.test.tsx do.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.mocked(getCurrentUser).mockReset();
});

describe("NavBar", () => {
  it("shows a Log in link when signed out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    render(await NavBar());
    expect(screen.getByRole("link", { name: "Log in" })).toBeTruthy();
  });

  it("shows the user's email and a Sign out button when signed in", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "U1", email: "a@example.com" });
    render(await NavBar());
    expect(screen.getByText("a@example.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
});
