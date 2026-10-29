import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { LOCALES } from "../../src/i18n/config";
import { loadMessages } from "../../src/i18n/messages";
import {
  changedDuringCheck,
  DISCONNECTED_DURING_CHECK,
  REPLACED_DURING_CHECK,
  localizeRevenueText,
  localizedMakerMessage,
  matchRevenueText,
  revenueText,
  VerificationError,
  type RevenueErrorKey,
} from "../../src/lib/revenue/errors";
import english from "../../src/messages/en/revenueErrors.json";

describe("writes the database refused because the connection changed during a check", () => {
  it("tell the maker that the key was replaced or the provider disconnected", () => {
    const replaced = changedDuringCheck("The connection changed during the check");
    expect(replaced).toBeInstanceOf(VerificationError);
    expect(replaced?.message).toBe(REPLACED_DURING_CHECK);
    const disconnected = changedDuringCheck("The product is not connected to this provider");
    expect(disconnected).toBeInstanceOf(VerificationError);
    expect(disconnected?.message).toBe(DISCONNECTED_DURING_CHECK);
  });

  it("leave every other failure to the generic answer", () => {
    expect(changedDuringCheck(undefined)).toBeNull();
    expect(changedDuringCheck("Only the owner can do this")).toBeNull();
  });
});

function leaves(tree: object, prefix = ""): [RevenueErrorKey, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[`${prefix}${key}` as RevenueErrorKey, value]]
      : leaves(value, `${prefix}${key}.`),
  );
}

const values = {
  provider: "Stripe",
  count: 3,
  max: 80,
  currency: "EUR",
  price: "price_example",
  permission: "Invoices",
  scope: "orders:read",
  site: "example",
  permissions: "payments:write",
  chart: "MRR",
  path: "/reports",
  columns: "Date, Amount",
  packages: "com.example.app",
  several: "yes",
  list: "plans",
  missing: "subscriptions",
  detail: "A readable provider detail.",
};

describe("stored verification messages", () => {
  it("can recover the arguments of every English message, including plurals and selects", () => {
    for (const [key] of leaves(english)) {
      const text = revenueText(key, values);
      const found = matchRevenueText(text);
      expect(found, key).not.toBeNull();
      expect(found!.map((part) => revenueText(part.key, part.values)).join(" "), key).toBe(text);
    }
  });

  it("translates several stored notes together, preserving their counts", async () => {
    const text = `${revenueText("stripe.deletedCoupons", { count: 3 })} ${revenueText("stripe.taxIncluded", { count: 2 })}`;
    for (const locale of LOCALES) {
      const t = createTranslator({
        locale,
        messages: await loadMessages(locale),
        namespace: "revenueErrors",
      });
      expect(await localizeRevenueText(text, locale), locale).toBe(
        [t("stripe.deletedCoupons", { count: 3 }), t("stripe.taxIncluded", { count: 2 })].join(
          locale === "zh" ? "" : " ",
        ),
      );
    }
  });

  it("translates keyed errors and leaves unrecognized historical notes intact", async () => {
    const failure = new VerificationError("stripe.keyFormat");
    for (const locale of LOCALES) {
      const t = createTranslator({
        locale,
        messages: await loadMessages(locale),
        namespace: "revenueErrors",
      });
      expect(await localizedMakerMessage(failure, locale)).toBe(t("stripe.keyFormat"));
    }
    expect(await localizeRevenueText(null, "es")).toBeNull();
    expect(await localizeRevenueText("An older provider note.", "es")).toBe(
      "An older provider note.",
    );
  });

  it("keeps unexpected internal failures out of the translated response", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await localizedMakerMessage(new Error("Internal database detail"), "es")).toBe(
        (await loadMessages("es")).revenueErrors.failed,
      );
    } finally {
      log.mockRestore();
    }
  });
});
