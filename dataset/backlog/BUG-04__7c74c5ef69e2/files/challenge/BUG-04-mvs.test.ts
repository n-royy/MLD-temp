// BUG-04 Minimum Verification Scenarios as executable tests. Published to teams as
// challenge/BUG-04-mvs.test.ts; the grader replays this same file against the submitted source.
// Copy it to src/tests/bug-04-mvs.test.ts and run: pnpm vitest run tests/bug-04-mvs.test.ts
import { describe, expect, it } from "vitest";

import { POSITION_GAP, appendPosition, betweenPosition } from "~/lib/position";

describe("BUG-04-TC-01", () => {
  it("a card dropped above the first card of a fresh list goes strictly before it", () => {
    const first = appendPosition(null);
    const dropped = betweenPosition(null, first);
    expect(dropped).toBeGreaterThan(0);
    expect(dropped).toBeLessThan(first);
  });
});

describe("BUG-04-TC-02", () => {
  it("C then B dropped at the top of A, B, C gives the order B, C, A without ties", () => {
    const a = POSITION_GAP;
    const c = betweenPosition(null, a);
    const b = betweenPosition(null, c);
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThan(c);
    expect(c).toBeLessThan(a);
  });
});

describe("BUG-04-TC-03", () => {
  it("drops between two cards and at the bottom keep their positions", () => {
    expect(betweenPosition(POSITION_GAP, 2 * POSITION_GAP)).toBe(1.5 * POSITION_GAP);
    expect(betweenPosition(3 * POSITION_GAP, null)).toBe(4 * POSITION_GAP);
    expect(betweenPosition(null, null)).toBe(POSITION_GAP);
  });
  it("together with the fix: a drop above a card at position 65536 stays positive", () => {
    const dropped = betweenPosition(null, POSITION_GAP);
    expect(dropped).toBeGreaterThan(0);
    expect(dropped).toBeLessThan(POSITION_GAP);
  });
});
