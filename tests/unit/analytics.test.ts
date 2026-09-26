import { describe, expect, it } from "vitest";
import { isAdminPath, vercelEvent } from "../../src/lib/analytics";

describe("analytics", () => {
  it("never measures admin pages", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/feedback")).toBe(true);
    expect(isAdminPath("/administrator")).toBe(false);
    expect(isAdminPath("/")).toBe(false);
    expect(vercelEvent({ type: "pageview", url: "https://thesaasharbor.com/admin" })).toBeNull();
    expect(
      vercelEvent({ type: "pageview", url: "https://thesaasharbor.com/admin/log?page=2" }),
    ).toBeNull();
  });

  it("sends Vercel only the path and campaign tags", () => {
    expect(
      vercelEvent({
        type: "pageview",
        url: "https://thesaasharbor.com/auth/confirm?token_hash=secret&type=signup#top",
      }),
    ).toEqual({ type: "pageview", url: "https://thesaasharbor.com/auth/confirm" });
    expect(
      vercelEvent({
        type: "event",
        url: "https://thesaasharbor.com/discover?q=crm&utm_source=x&utm_campaign=launch&utm_id=1",
      }),
    ).toEqual({
      type: "event",
      url: "https://thesaasharbor.com/discover?utm_source=x&utm_campaign=launch",
    });
    expect(vercelEvent({ type: "pageview", url: "https://thesaasharbor.com/" })).toEqual({
      type: "pageview",
      url: "https://thesaasharbor.com/",
    });
  });
});
