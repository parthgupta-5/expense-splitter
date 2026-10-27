// Profile photos are checked and re-encoded in the browser before upload. The file's own bytes decide what it is (not
// its name or the type the browser guesses), and its pixel size is read from the header before anything is decoded,
// so a small file that would expand to a huge image is refused. Drawing onto a canvas and saving a new JPEG keeps
// only pixels: EXIF, GPS location, camera details and any other metadata are left behind.
// No imports: the browser tests load this file on its own.

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_SIZE = 512;
export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_PIXELS = 40_000_000;
const JPEG_QUALITY = 0.88;

export const AVATAR_MESSAGES = {
  empty: 'Choose a photo.',
  tooLarge: 'Choose a photo under 5 MB.',
  unsupported: 'Use a JPG, PNG or WebP photo.',
  unreadable: 'That photo could not be read. Try a different JPG, PNG or WebP file.',
  tooManyPixels: 'That photo has too many pixels to prepare. Try a smaller one.',
  encodeFailed: 'This browser could not prepare the photo. Try another browser.',
};

/** A problem with the chosen file, with a message that can be shown as it is. */
export class AvatarFileError extends Error {}

const ascii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));

/** 'image/jpeg' | 'image/png' | 'image/webp' from the file's first bytes, or null for anything else. */
export function sniffImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, i) => bytes[i] === value)) {
    return 'image/png';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  return null;
}

const u16be = (b, i) => (b[i] << 8) | b[i + 1];
const u32be = (b, i) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
const u16le = (b, i) => b[i] | (b[i + 1] << 8);
const u24le = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
// JPEG start-of-frame markers, which carry the image size.
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** { width, height } read from the image header without decoding it, or null when the header is not valid. */
export function readImageSize(bytes, type) {
  if (type === 'image/png') {
    if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') return null;
    return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }
  if (type === 'image/webp') {
    if (bytes.length < 30) return null;
    const chunk = ascii(bytes, 12, 4);
    if (chunk === 'VP8 ') return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
    if (chunk === 'VP8L') {
      const [b0, b1, b2, b3] = bytes.subarray(21, 25);
      return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
    if (chunk === 'VP8X') return { width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) };
    return null;
  }
  if (type === 'image/jpeg') {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      if (marker === 0xff) { i += 1; continue; } // fill byte
      if (SOF.has(marker)) return { width: u16be(bytes, i + 7), height: u16be(bytes, i + 5) };
      if (marker === 0xd9 || marker === 0xda) return null; // end of image / scan data before any size
      if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; } // markers without a length
      i += 2 + u16be(bytes, i + 2);
    }
  }
  return null;
}

async function readBytes(blob) {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Uint8Array(await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  }));
}

/**
 * Checks a chosen file before anything else happens: size first (nothing is read past 5 MB), then the real format
 * from its bytes, then the pixel size from its header. Resolves to { type, width, height }; throws AvatarFileError.
 */
export async function checkAvatarFile(file) {
  if (!file || typeof file.size !== 'number' || file.size === 0) throw new AvatarFileError(AVATAR_MESSAGES.empty);
  if (file.size > AVATAR_MAX_BYTES) throw new AvatarFileError(AVATAR_MESSAGES.tooLarge);
  const bytes = await readBytes(file);
  const type = sniffImageType(bytes);
  if (!type) throw new AvatarFileError(AVATAR_MESSAGES.unsupported);
  const size = readImageSize(bytes, type);
  if (!size || !size.width || !size.height) throw new AvatarFileError(AVATAR_MESSAGES.unreadable);
  if (size.width * size.height > MAX_PIXELS) throw new AvatarFileError(AVATAR_MESSAGES.tooManyPixels);
  return { type, ...size };
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file, { imageOrientation: 'from-image' });
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The photo as a new AVATAR_SIZE x AVATAR_SIZE JPEG (centre square, white behind transparent areas) with no metadata.
 * Throws AvatarFileError with a message to show.
 */
export async function reencodeAvatar(file, { size = AVATAR_SIZE } = {}) {
  await checkAvatarFile(file);
  let image;
  try {
    image = await decode(file);
  } catch {
    throw new AvatarFileError(AVATAR_MESSAGES.unreadable);
  }
  try {
    const width = image.width || image.naturalWidth;
    const height = image.height || image.naturalHeight;
    if (!width || !height) throw new AvatarFileError(AVATAR_MESSAGES.unreadable);
    const side = Math.min(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, size, size);
    const blob = await new Promise((resolve) => { canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY); });
    if (!blob || blob.type !== 'image/jpeg') throw new AvatarFileError(AVATAR_MESSAGES.encodeFailed);
    return blob;
  } finally {
    image.close?.();
  }
}
