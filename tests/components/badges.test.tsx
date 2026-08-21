// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SeverityBadge } from "@/components/SeverityBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { SEVERITIES, INCIDENT_STATUSES } from "@/lib/types";

afterEach(cleanup);

describe("SeverityBadge", () => {
  it("renders the correct uppercase label for every severity", () => {
    for (const severity of SEVERITIES) {
      const { unmount } = render(<SeverityBadge severity={severity} />);
      expect(screen.getByText(severity.toUpperCase())).toBeTruthy();
      unmount();
    }
  });
});

describe("StatusBadge", () => {
  it("renders a distinct capitalized label for every status", () => {
    const seen = new Set<string>();
    for (const status of INCIDENT_STATUSES) {
      const { unmount } = render(<StatusBadge status={status} />);
      const label = screen.getByText(status[0]!.toUpperCase() + status.slice(1));
      expect(label).toBeTruthy();
      seen.add(label.textContent ?? "");
      unmount();
    }
    // Each status must render a visually distinct label, not the same
    // generic text for every value.
    expect(seen.size).toBe(INCIDENT_STATUSES.length);
  });
});
