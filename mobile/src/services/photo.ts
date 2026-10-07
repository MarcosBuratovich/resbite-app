export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
// Remove all JPEG application/comment segments (EXIF, GPS, XMP, thumbnails),
// including any segments between progressive scans. Keep image coding data only.
export function stripJpegMetadata(input: Uint8Array): Uint8Array {
  if (input[0] !== 255 || input[1] !== 216)
    throw Error("The photo could not be converted to JPEG.");
  const output: number[] = [255, 216];
  let i = 2,
    ended = false;
  while (i < input.length) {
    if (input[i] !== 255) {
      output.push(input[i++]);
      continue;
    }
    const start = i++;
    while (input[i] === 255) i++;
    const marker = input[i++];
    if (marker === undefined) throw Error("Incomplete JPEG.");
    if (marker === 0 || (marker >= 208 && marker <= 215)) {
      output.push(...input.slice(start, i));
      continue;
    }
    if (marker === 217) {
      output.push(255, 217);
      ended = true;
      break;
    }
    const length = (input[i] << 8) | input[i + 1];
    if (length < 2 || i + length > input.length)
      throw Error("Incomplete JPEG segment.");
    if (!((marker >= 224 && marker <= 239) || marker === 254)) {
      for (let j = start; j < i + length; j++) output.push(input[j]);
    }
    i += length;
  }
  if (!ended) throw Error("Incomplete JPEG.");
  const bytes = Uint8Array.from(output);
  if (bytes.byteLength > MAX_PHOTO_BYTES)
    throw Error("That photo is still too large. Choose a smaller image.");
  return bytes;
}
export function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
export function toBase64(value: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < value.length; i += 8192)
    binary += String.fromCharCode(...value.slice(i, i + 8192));
  return btoa(binary);
}
export async function chooseNormalizedPhoto(): Promise<{
  bytes: Uint8Array;
  uri: string;
} | null> {
  const Picker = await import("expo-image-picker");
  const result = await Picker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    allowsMultipleSelection: false,
    exif: false,
    base64: false,
    quality: 1,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset || !asset.width || !asset.height)
    throw Error("This image could not be read. Choose another photo.");
  const { ImageManipulator, SaveFormat } =
    await import("expo-image-manipulator");
  const context = ImageManipulator.manipulate(asset.uri);
  let image: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  try {
    context.resize(
      asset.width >= asset.height
        ? { width: Math.min(asset.width, 1024) }
        : { height: Math.min(asset.height, 1024) },
    );
    image = await context.renderAsync();
    if (image.width > 1024 || image.height > 1024)
      throw Error("The resized photo is too large. Choose another image.");
    const normalized = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.8,
      base64: true,
    });
    if (!normalized.base64) throw Error("Could not prepare that photo.");
    const bytes = stripJpegMetadata(fromBase64(normalized.base64));
    return { bytes, uri: `data:image/jpeg;base64,${toBase64(bytes)}` };
  } finally {
    image?.release();
    context.release();
  }
}
