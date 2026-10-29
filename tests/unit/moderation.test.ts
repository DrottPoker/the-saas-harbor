import { describe, expect, it } from "vitest";
import { safeAdminPath } from "../../src/lib/admin";
import { decisionSchema, noteSchema, reportSchema, safeNext } from "../../src/lib/domain";
import {
  decisionLabels,
  excerpt,
  isReason,
  isReportTarget,
  REASONS,
  reasonLabels,
  REPORT_ERRORS,
  reportPath,
  reportSubject,
  reportTitle,
} from "../../src/lib/moderation";
import en from "../../src/messages/en";
import { userErrorsOf } from "./support/migrations";

const uuid = "b0000000-0000-4000-8000-000000000001";

describe("report reasons", () => {
  it("has a label and a hint for every reason, the same in English for users and admins", () => {
    for (const reason of REASONS) {
      expect(reasonLabels[reason]).toBeTruthy();
      expect(en.reports.reasons[reason].label).toBe(reasonLabels[reason]);
      expect(en.reports.reasons[reason].hint).toBeTruthy();
      expect(en.moderation.decisions[reason]).toBe(decisionLabels[reason]);
    }
  });
  it("recognizes only known reasons and targets", () => {
    expect(isReason("spam")).toBe(true);
    expect(isReason("constructor")).toBe(false);
    expect(isReportTarget("message")).toBe(true);
    expect(isReportTarget("conversation")).toBe(false);
  });
});

describe("report form", () => {
  it("accepts a reason with optional details", () => {
    expect(reportSchema.safeParse({ reason: "spam", details: "" }).success).toBe(true);
    expect(reportSchema.parse({ reason: "misleading", details: "  False claims.  " })).toEqual({
      reason: "misleading",
      details: "False claims.",
    });
  });
  it.each(["illegal", "other"])("needs details for %s", (reason) => {
    const result = reportSchema.safeParse({ reason, details: "   " });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Describe the problem so it can be reviewed.");
  });
  it("refuses unknown reasons and long details", () => {
    expect(reportSchema.safeParse({ reason: "boring", details: "" }).success).toBe(false);
    expect(reportSchema.safeParse({ reason: "spam", details: "x".repeat(1001) }).success).toBe(
      false,
    );
  });
});

describe("admin decisions", () => {
  it("needs a reason and an explanation for the maker", () => {
    expect(
      decisionSchema.safeParse({ reason: "spam", note: "Repeated advertising." }).success,
    ).toBe(true);
    expect(decisionSchema.safeParse({ reason: "spam", note: "  " }).success).toBe(false);
    expect(decisionSchema.safeParse({ reason: "", note: "Why" }).success).toBe(false);
  });
  it("keeps optional notes short", () => {
    expect(noteSchema.parse("  ")).toBe("");
    expect(noteSchema.safeParse("x".repeat(1001)).success).toBe(false);
  });
  it("returns only to admin detail pages", () => {
    for (const page of ["reports", "products", "accounts"])
      expect(safeAdminPath(`/admin/${page}/${uuid}`)).toBe(`/admin/${page}/${uuid}`);
    for (const value of [
      "/admin",
      "/dashboard",
      "https://evil.example/admin/reports/x",
      `//evil.example/admin/reports/${uuid}`,
      `/admin/reports/${uuid}?done=1`,
      `/admin/log/${uuid}`,
    ])
      expect(safeAdminPath(value)).toBeNull();
  });
});

describe("report links and titles", () => {
  it("builds report paths that sign-in may continue to", () => {
    for (const target of ["saas", "profile", "message"] as const)
      expect(safeNext(reportPath(target, uuid))).toBe(`/report/${target}/${uuid}`);
    expect(safeNext(`/report/conversation/${uuid}`)).toBeNull();
    expect(safeNext("/report/saas/not-a-uuid")).toBeNull();
  });
  it("titles reports from the stored copy", () => {
    expect(reportTitle({ target: "saas", content: { name: "Ledgerloop" } })).toBe("Ledgerloop");
    expect(reportTitle({ target: "profile", content: {} })).toBe("Unnamed");
    expect(reportTitle({ target: "message", content: { body: "Buy   now\nplease" } })).toBe(
      "“Buy now please”",
    );
    expect(reportTitle({ target: "message", content: null })).toBe("A message");
  });
  it("finds what a report is about, for titles in every language", () => {
    expect(reportSubject({ target: "saas", content: { name: "Ledgerloop" } })).toBe("Ledgerloop");
    expect(reportSubject({ target: "profile", content: { name: "" } })).toBeNull();
    expect(reportSubject({ target: "message", content: { body: "Hi\nthere" } })).toBe("Hi there");
    expect(reportSubject({ target: "message", content: { name: "Jane" } })).toBeNull();
  });
  it("has a message for every error submit_report() gives users, worded as the database does", () => {
    const raised = userErrorsOf("submit_report");
    expect([...REPORT_ERRORS.keys()].sort()).toEqual([...new Set(raised)].sort());
    for (const [text, key] of REPORT_ERRORS)
      expect(en.reports.errors[key].replace("{max}", "1,000")).toBe(`${text}.`);
  });
  it("shortens long text at a word", () => {
    expect(excerpt("short")).toBe("short");
    expect(excerpt("one two three four five", 12)).toBe("one two…");
    expect(excerpt("x".repeat(20), 10)).toBe(`${"x".repeat(10)}…`);
  });
});
