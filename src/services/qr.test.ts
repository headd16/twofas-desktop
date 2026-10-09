import { it, expect } from "vitest";
import QRCode from "qrcode";
import { PNG } from "pngjs";
import {
  RGBLuminanceSource,
  HybridBinarizer,
  BinaryBitmap,
  QRCodeReader,
} from "@zxing/library";
it("decodes a locally generated standard account QR image with ZXing", async () => {
  const uri =
    "otpauth://totp/RFC%3Atest?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=RFC";
  const png = PNG.sync.read(
    await QRCode.toBuffer(uri, { width: 320, margin: 4 }),
  );
  const luminance = new Uint8ClampedArray(png.width * png.height);
  for (let i = 0; i < luminance.length; i++) {
    const j = i * 4;
    luminance[i] = (png.data[j] + 2 * png.data[j + 1] + png.data[j + 2]) / 4;
  }
  const bitmap = new BinaryBitmap(
    new HybridBinarizer(
      new RGBLuminanceSource(luminance, png.width, png.height),
    ),
  );
  expect(new QRCodeReader().decode(bitmap).getText()).toBe(uri);
});
