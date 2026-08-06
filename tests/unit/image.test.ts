import { describe, it, expect } from "vitest";
import { parseImage } from "../../src/worker/lib/image";

function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR width/height big-endian at 16/20
  b[16] = (width >>> 24) & 0xff;
  b[17] = (width >>> 16) & 0xff;
  b[18] = (width >>> 8) & 0xff;
  b[19] = width & 0xff;
  b[20] = (height >>> 24) & 0xff;
  b[21] = (height >>> 16) & 0xff;
  b[22] = (height >>> 8) & 0xff;
  b[23] = height & 0xff;
  return b;
}

function gif(width: number, height: number): Uint8Array {
  const b = new Uint8Array(10);
  b.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // GIF89a
  b[6] = width & 0xff;
  b[7] = (width >> 8) & 0xff;
  b[8] = height & 0xff;
  b[9] = (height >> 8) & 0xff;
  return b;
}

describe("parseImage", () => {
  it("reads PNG dimensions and type", () => {
    expect(parseImage(png(120, 80))).toEqual({ contentType: "image/png", width: 120, height: 80 });
  });

  it("reads GIF dimensions (little-endian) and type", () => {
    expect(parseImage(gif(300, 200))).toEqual({ contentType: "image/gif", width: 300, height: 200 });
  });

  it("rejects non-images", () => {
    expect(parseImage(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
    expect(parseImage(new TextEncoder().encode("<html>not an image</html>"))).toBeNull();
  });
});
