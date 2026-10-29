import { afterEach, describe, expect, it } from "vitest";
import { LOCALES } from "../../src/i18n/config";
import { loadMessages } from "../../src/i18n/messages";
import { failureMessage, localizeValidation } from "../../src/lib/localize-validation";
import { saasSchema } from "../../src/lib/domain";
import { uploadImage } from "../../src/lib/upload";
import { invalid } from "../../src/lib/validation";
import { setTestLocale } from "./support/next-intl-server";

afterEach(() => setTestLocale("en"));

describe("validation in the visitor's language", () => {
  it("translates image upload failures before an action returns them", async () => {
    const tooLarge = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png", {
      type: "image/png",
    });
    for (const locale of LOCALES) {
      setTestLocale(locale);
      try {
        await uploadImage({} as Parameters<typeof uploadImage>[0], "owner", tooLarge);
        expect.fail("The oversized image must be refused before storage is contacted.");
      } catch (error) {
        expect(await failureMessage(error)).toBe(
          (await loadMessages(locale)).validation.image.size,
        );
      }
    }
  });

  it("translates schema failures and a message's numeric arguments", async () => {
    const parsed = saasSchema.safeParse({});
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    setTestLocale("es");
    expect(await localizeValidation(parsed.error)).toBe(
      (await loadMessages("es")).validation.form.checkFields,
    );
    expect(await localizeValidation(invalid("image.dimensions", { max: 4096 }))).toContain("4096");
    expect(await localizeValidation(invalid("image.dimensions", { max: 4096 }))).toContain(
      "píxeles",
    );
  });
});
