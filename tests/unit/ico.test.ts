import { describe, expect, it } from "vitest";
import { icoFile } from "../../src/lib/ico";

describe("the favicon file", () => {
  it("holds each PNG after a directory that points at it", () => {
    const small = new Uint8Array([1, 2, 3]);
    const large = new Uint8Array([4, 5]);
    const file = icoFile([
      { size: 16, png: small },
      { size: 256, png: large },
    ]);
    const view = new DataView(file.buffer);
    expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([
      0, 1, 2,
    ]);
    // Each entry: width, height, planes, bits per pixel, length and offset; 256 is written as 0.
    const entry = (index: number) => {
      const at = 6 + 16 * index;
      return [
        view.getUint8(at),
        view.getUint8(at + 1),
        view.getUint16(at + 4, true),
        view.getUint16(at + 6, true),
        view.getUint32(at + 8, true),
        view.getUint32(at + 12, true),
      ];
    };
    expect(entry(0)).toEqual([16, 16, 1, 32, 3, 38]);
    expect(entry(1)).toEqual([0, 0, 1, 32, 2, 41]);
    expect([...file.slice(38)]).toEqual([1, 2, 3, 4, 5]);
    expect(file.length).toBe(43);
  });
});
