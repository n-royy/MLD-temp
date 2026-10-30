// CR-03 Minimum Verification Scenarios as executable tests. Published to teams as
// challenge/CR-03-mvs.test.ts; the grader replays this same file against the submitted source.
// Copy it to src/tests/cr-03-mvs.test.ts and run: pnpm vitest run tests/cr-03-mvs.test.ts
import { describe, expect, it } from "vitest";

import { phoneUrl, telegramUrl, whatsappUrl } from "~/lib/contact-links";

describe("CR-03-TC-02", () => {
  it("normalises a Vietnamese mobile number typed with spaces", () => {
    expect(whatsappUrl("0987 654 321")).toBe("https://wa.me/84987654321");
    expect(phoneUrl("0987 654 321")).toBe("tel:+84987654321");
  });
  it("keeps an international number typed with +, parentheses and dashes", () => {
    expect(whatsappUrl("+44 (20) 7946-0018")).toBe("https://wa.me/442079460018");
  });
  it("gives no link for a number with an extension", () => {
    expect(whatsappUrl("0987-654-321 x2")).toBeNull();
    expect(phoneUrl("0987-654-321 x2")).toBeNull();
  });
});

describe("CR-03-TC-03", () => {
  it("accepts @name and t.me links and keeps the case of the username", () => {
    expect(telegramUrl("@sales_team")).toBe("https://t.me/sales_team");
    expect(telegramUrl("t.me/SalesTeam/")).toBe("https://t.me/SalesTeam");
  });
  it("gives no link for a username that is too short", () => {
    expect(telegramUrl("@abc")).toBeNull();
  });
});
