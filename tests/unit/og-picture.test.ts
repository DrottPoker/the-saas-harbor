import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ogPictureSource } from "../../src/lib/og-picture";

// A 1x1 PNG, and the first bytes of a JPEG and of a WebP file: enough for their signatures.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00,
  0x03, 0x01, 0x01, 0x11, 0x00,
]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF\0\0\0\0WEBPVP8X\0\0\0\0\0\0\0\0", "latin1"),
  Buffer.alloc(8),
]);

const answer = (body: Buffer, status = 200) => new Response(new Uint8Array(body), { status });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("a sharing card's picture", () => {
  it("is read from storage and embedded, so the card needs no address", async () => {
    const fetcher = vi.fn().mockResolvedValue(answer(PNG));
    vi.stubGlobal("fetch", fetcher);
    expect(await ogPictureSource("owner/logo 1.png")).toBe(
      `data:image/png;base64,${PNG.toString("base64")}`,
    );
    expect(fetcher.mock.calls[0][0]).toBe(
      "http://127.0.0.1:55321/storage/v1/object/public/profile-images/owner/logo%201.png",
    );
    fetcher.mockResolvedValue(answer(JPEG));
    expect(await ogPictureSource("owner/photo.JPG")).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("is told by its bytes, not its name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer(JPEG)));
    expect(await ogPictureSource("owner/logo.png")).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("gives way to initials for what Satori cannot draw, without asking for it", async () => {
    const fetcher = vi.fn().mockResolvedValue(answer(WEBP));
    vi.stubGlobal("fetch", fetcher);
    expect(await ogPictureSource("owner/logo.webp")).toBeNull();
    expect(await ogPictureSource(null)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    // A WebP or other file stored under a PNG's name.
    expect(await ogPictureSource("owner/logo.png")).toBeNull();
    fetcher.mockResolvedValue(answer(Buffer.from("<html>not an image</html>")));
    expect(await ogPictureSource("owner/logo.png")).toBeNull();
  });

  it("gives way to initials when the file is missing, too large or cannot be read", async () => {
    const fetcher = vi.fn().mockResolvedValue(answer(Buffer.from("Not found"), 404));
    vi.stubGlobal("fetch", fetcher);
    expect(await ogPictureSource("owner/logo.png")).toBeNull();
    fetcher.mockResolvedValue(answer(Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)])));
    expect(await ogPictureSource("owner/logo.png")).toBeNull();
    fetcher.mockRejectedValue(new Error("The operation timed out"));
    expect(await ogPictureSource("owner/logo.png")).toBeNull();
  });
});
