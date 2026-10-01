import { describe, expect, it } from "vitest";
import {
  changedDuringCheck,
  DISCONNECTED_DURING_CHECK,
  REPLACED_DURING_CHECK,
  VerificationError,
} from "../../src/lib/revenue/errors";

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
