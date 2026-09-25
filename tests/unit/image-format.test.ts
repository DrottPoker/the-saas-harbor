import { describe, expect, it } from "vitest";
import { imageInfo } from "../../src/lib/image-format";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part,
    ),
  );
const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16be = (n: number) => [(n >>> 8) & 255, n & 255];
const riff = (chunk: string, body: number[]) =>
  bytes("RIFF", [0, 0, 0, 0], "WEBP", chunk, [0, 0, 0, 0], body);

const png = (width: number, height: number) =>
  bytes([137, 80, 78, 71, 13, 10, 26, 10], [0, 0, 0, 13], "IHDR", u32be(width), u32be(height));
// A JPEG with an application segment before the frame, as cameras write them.
const jpeg = (width: number, height: number) =>
  bytes(
    [0xff, 0xd8],
    [0xff, 0xe0, 0, 6, 1, 2, 3, 4],
    [0xff, 0xc0, 0, 11, 8],
    u16be(height),
    u16be(width),
    [3, 1, 2],
  );

describe("image formats", () => {
  it("reads the size of a PNG", () =>
    expect(imageInfo(png(640, 480))).toEqual({
      extension: "png",
      type: "image/png",
      width: 640,
      height: 480,
    }));
  it("reads the size of a JPEG from its first frame, past other segments", () =>
    expect(imageInfo(jpeg(4032, 3024))).toMatchObject({
      type: "image/jpeg",
      width: 4032,
      height: 3024,
    }));
  it("reads the size of lossy, lossless and extended WebP", () => {
    const lossy = riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0xe0, 0x01]);
    expect(imageInfo(lossy)).toMatchObject({ type: "image/webp", width: 640, height: 480 });
    // 14 bits each for width - 1 and height - 1: 639 and 479.
    const bits = 639 | (479 << 14);
    const lossless = riff("VP8L", [
      0x2f,
      bits & 255,
      (bits >>> 8) & 255,
      (bits >>> 16) & 255,
      bits >>> 24,
    ]);
    expect(imageInfo(lossless)).toMatchObject({ width: 640, height: 480 });
    const extended = riff("VP8X", [0, 0, 0, 0, 0x7f, 0x02, 0, 0xdf, 0x01, 0]);
    expect(imageInfo(extended)).toMatchObject({ width: 640, height: 480 });
  });
  it("reports a huge picture in a small file, so it can be refused", () =>
    expect(imageInfo(png(30_000, 30_000))).toMatchObject({ width: 30_000, height: 30_000 }));
  it("recognizes nothing else", () => {
    expect(imageInfo(bytes("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(imageInfo(bytes("GIF89a", [1, 0, 1, 0]))).toBeNull();
    expect(imageInfo(bytes([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    expect(imageInfo(new Uint8Array())).toBeNull();
  });
});
