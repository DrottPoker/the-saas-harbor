/**
 * An ICO file holding PNG images, the form browsers and Windows read since Windows Vista. Sizes go
 * up to 256 pixels; the directory writes 256 as 0.
 */
export function icoFile(images: { size: number; png: Uint8Array }[]) {
  const directory = 6 + 16 * images.length;
  const file = new Uint8Array(images.reduce((total, image) => total + image.png.length, directory));
  const view = new DataView(file.buffer);
  view.setUint16(2, 1, true); // An icon, not a cursor.
  view.setUint16(4, images.length, true);
  let offset = directory;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + 16 * index;
    view.setUint8(entry, size % 256);
    view.setUint8(entry + 1, size % 256);
    view.setUint16(entry + 4, 1, true); // Color planes.
    view.setUint16(entry + 6, 32, true); // Bits per pixel.
    view.setUint32(entry + 8, png.length, true);
    view.setUint32(entry + 12, offset, true);
    file.set(png, offset);
    offset += png.length;
  });
  return file;
}
