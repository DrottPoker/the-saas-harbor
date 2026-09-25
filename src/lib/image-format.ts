// Reads an image's format and size from its first bytes, without decoding it. Pure, so it is
// unit-tested. Formats are told apart by their signature, never by the file name or type.

export const MAX_IMAGE_SIDE = 4096;

export type ImageInfo = {
  extension: "png" | "jpg" | "webp";
  type: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
};

const text = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.slice(start, end));
const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) =>
  ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

function png(b: Uint8Array): ImageInfo | null {
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => b[i] === n)) return null;
  if (text(b, 12, 16) !== "IHDR") return null;
  return { extension: "png", type: "image/png", width: u32be(b, 16), height: u32be(b, 20) };
}

// The size is in the first start-of-frame segment; other segments are skipped by their length.
function jpeg(b: Uint8Array): ImageInfo | null {
  if (b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    const frame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (frame)
      return {
        extension: "jpg",
        type: "image/jpeg",
        width: u16be(b, i + 7),
        height: u16be(b, i + 5),
      };
    if (marker === 0xd9 || marker === 0xda) return null;
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function webp(b: Uint8Array): ImageInfo | null {
  if (text(b, 0, 4) !== "RIFF" || text(b, 8, 12) !== "WEBP") return null;
  const chunk = text(b, 12, 16);
  const info = (width: number, height: number): ImageInfo => ({
    extension: "webp",
    type: "image/webp",
    width,
    height,
  });
  if (chunk === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)
    return info(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  if (chunk === "VP8L" && b[20] === 0x2f) {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return info((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === "VP8X") return info(u24le(b, 24) + 1, u24le(b, 27) + 1);
  return null;
}

/** The format and pixel size of a PNG, JPEG or WebP image, or null for anything else. */
export function imageInfo(bytes: Uint8Array): ImageInfo | null {
  return png(bytes) ?? jpeg(bytes) ?? webp(bytes);
}
