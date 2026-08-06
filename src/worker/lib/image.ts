/**
 * Dependency-free image sniffing. The Workers runtime has no `sharp`, so we
 * validate uploads by their real magic bytes (never by client-declared MIME or
 * filename) and read intrinsic dimensions straight from the header. Supports
 * PNG, JPEG, GIF and WebP — the formats this app accepts.
 */

export type ImageFormat = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

export interface ImageInfo {
  contentType: ImageFormat;
  width: number;
  height: number;
}

export function parseImage(bytes: Uint8Array): ImageInfo | null {
  return parsePng(bytes) ?? parseJpeg(bytes) ?? parseGif(bytes) ?? parseWebp(bytes);
}

function u16be(b: Uint8Array, o: number): number {
  return (b[o]! << 8) | b[o + 1]!;
}
function u32be(b: Uint8Array, o: number): number {
  return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}
function u16le(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8);
}
function u24le(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
}

function parsePng(b: Uint8Array): ImageInfo | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24) return null;
  for (let i = 0; i < 8; i++) if (b[i] !== sig[i]) return null;
  // IHDR width/height are big-endian at offsets 16/20.
  return { contentType: "image/png", width: u32be(b, 16), height: u32be(b, 20) };
}

function parseJpeg(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = b[offset + 1]!;
    // SOF markers carry the frame dimensions (skip DHT/DAC/RST/etc.).
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      return { contentType: "image/jpeg", height: u16be(b, offset + 5), width: u16be(b, offset + 7) };
    }
    const segmentLength = u16be(b, offset + 2);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

function parseGif(b: Uint8Array): ImageInfo | null {
  if (b.length < 10) return null;
  const header = String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!, b[4]!, b[5]!);
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  return { contentType: "image/gif", width: u16le(b, 6), height: u16le(b, 8) };
}

function parseWebp(b: Uint8Array): ImageInfo | null {
  if (b.length < 30) return null;
  const riff = String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!);
  const webp = String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!);
  if (riff !== "RIFF" || webp !== "WEBP") return null;
  const format = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);

  if (format === "VP8 ") {
    // Lossy: 14-bit width/height after the 0x9d 0x01 0x2a start code.
    return {
      contentType: "image/webp",
      width: u16le(b, 26) & 0x3fff,
      height: u16le(b, 28) & 0x3fff,
    };
  }
  if (format === "VP8L") {
    const b1 = b[21]!;
    const b2 = b[22]!;
    const b3 = b[23]!;
    const b4 = b[24]!;
    return {
      contentType: "image/webp",
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
    };
  }
  if (format === "VP8X") {
    // Extended: 24-bit (value + 1) width/height, little-endian, at offset 24/27.
    return {
      contentType: "image/webp",
      width: 1 + u24le(b, 24),
      height: 1 + u24le(b, 27),
    };
  }
  return null;
}
