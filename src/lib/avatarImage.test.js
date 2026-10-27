// @vitest-environment jsdom
// Checking a chosen photo from its bytes (format, header size, 5 MB limit) and the re-encode flow. The real canvas
// re-encode (and the proof that EXIF/GPS is gone) runs in a real browser in e2e/avatar.spec.js.
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import {
  AVATAR_MAX_BYTES, AVATAR_MESSAGES, AvatarFileError, checkAvatarFile, readImageSize, reencodeAvatar, sniffImageType,
} from './avatarImage';

const bytes = (...parts) => new Uint8Array(parts.flatMap((part) => (typeof part === 'string'
  ? Array.from(part, (char) => char.charCodeAt(0))
  : part)));
const u32be = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16be = (n) => [(n >> 8) & 255, n & 255];
const u24le = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

// Headers only: enough for the checks, which never decode.
const png = (width, height) => bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], u32be(13), 'IHDR', u32be(width), u32be(height), [8, 6, 0, 0, 0]);
const jpeg = (width, height, { exif = false } = {}) => bytes(
  [0xff, 0xd8],
  [0xff, 0xe0], u16be(16), 'JFIF', [0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
  ...(exif ? [[0xff, 0xe1], u16be(2 + 6 + 20), 'Exif', [0, 0], 'GPS 12.97N 77.59E...'] : []),
  [0xff, 0xc0], u16be(17), [8], u16be(height), u16be(width), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1],
);
const webpLossy = (width, height) => bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8 ', [0, 0, 0, 0], [0, 0, 0], [0x9d, 0x01, 0x2a], [width & 255, width >> 8], [height & 255, height >> 8]);
const webpExtended = (width, height) => bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8X', [10, 0, 0, 0], [0, 0, 0, 0], u24le(width - 1), u24le(height - 1), [0, 0]);
const webpLossless = (width, height) => {
  const w = width - 1;
  const h = height - 1;
  return bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8L', [0, 0, 0, 0], [0x2f], [w & 0xff, ((w >> 8) & 0x3f) | ((h & 0x3) << 6), (h >> 2) & 0xff, (h >> 10) & 0xf], [0, 0, 0, 0, 0]);
};
const file = (data, name = 'photo.jpg', type = '') => new File([data], name, { type });

describe('sniffImageType', () => {
  it('recognises JPEG, PNG and WebP by their bytes', () => {
    expect(sniffImageType(jpeg(10, 10))).toBe('image/jpeg');
    expect(sniffImageType(png(10, 10))).toBe('image/png');
    expect(sniffImageType(webpLossy(10, 10))).toBe('image/webp');
  });

  it('refuses everything else, whatever the file is called', () => {
    for (const other of [
      bytes('GIF89a', [1, 0, 1, 0]),
      bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      bytes('%PDF-1.7\n'),
      bytes([0, 0, 0, 0x18], 'ftypheic', [0, 0, 0, 0]),
      bytes('BM', [0, 0, 0, 0]),
      bytes('RIFF', [0, 0, 0, 0], 'WAVE'),
      bytes([0xff, 0xd8]),
      bytes(''),
    ]) {
      expect(sniffImageType(other)).toBeNull();
    }
  });
});

describe('readImageSize', () => {
  it('reads the size from each header without decoding', () => {
    expect(readImageSize(png(640, 480), 'image/png')).toEqual({ width: 640, height: 480 });
    expect(readImageSize(jpeg(4032, 3024, { exif: true }), 'image/jpeg')).toEqual({ width: 4032, height: 3024 });
    expect(readImageSize(webpLossy(800, 600), 'image/webp')).toEqual({ width: 800, height: 600 });
    expect(readImageSize(webpLossless(321, 123), 'image/webp')).toEqual({ width: 321, height: 123 });
    expect(readImageSize(webpExtended(5000, 4000), 'image/webp')).toEqual({ width: 5000, height: 4000 });
  });

  it('gives up on broken or truncated headers', () => {
    expect(readImageSize(png(10, 10).slice(0, 20), 'image/png')).toBeNull();
    expect(readImageSize(bytes([0xff, 0xd8, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]), 'image/jpeg')).toBeNull();
    expect(readImageSize(bytes([0xff, 0xd8], [0xff, 0xda], u16be(8), [0, 0, 0, 0, 0, 0, 0, 0]), 'image/jpeg')).toBeNull();
    expect(readImageSize(bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'ALPH', new Array(20).fill(0)), 'image/webp')).toBeNull();
  });
});

describe('checkAvatarFile', () => {
  it('accepts JPG, PNG and WebP photos', async () => {
    await expect(checkAvatarFile(file(jpeg(1200, 900), 'a.jpg'))).resolves.toEqual({ type: 'image/jpeg', width: 1200, height: 900 });
    await expect(checkAvatarFile(file(jpeg(10, 10), 'a.JPEG'))).resolves.toMatchObject({ type: 'image/jpeg' });
    await expect(checkAvatarFile(file(png(64, 64), 'a.png'))).resolves.toMatchObject({ type: 'image/png' });
    await expect(checkAvatarFile(file(webpLossy(64, 64), 'a.webp'))).resolves.toMatchObject({ type: 'image/webp' });
  });

  it('trusts the bytes, not the name or the type the browser reports', async () => {
    await expect(checkAvatarFile(file(png(64, 64), 'photo.gif', 'image/gif'))).resolves.toMatchObject({ type: 'image/png' });
    await expect(checkAvatarFile(file(bytes('GIF89a', [1, 0, 1, 0]), 'photo.jpg', 'image/jpeg')))
      .rejects.toThrow(AVATAR_MESSAGES.unsupported);
    await expect(checkAvatarFile(file(bytes('<svg/>'), 'photo.png', 'image/png'))).rejects.toThrow(AVATAR_MESSAGES.unsupported);
    await expect(checkAvatarFile(file(bytes('%PDF-1.7'), 'cv.webp'))).rejects.toThrow(AVATAR_MESSAGES.unsupported);
    await expect(checkAvatarFile(file(bytes([0, 0, 0, 0x18], 'ftypheic'), 'IMG_1.HEIC'))).rejects.toThrow(AVATAR_MESSAGES.unsupported);
  });

  it('refuses files over 5 MB before reading them', async () => {
    const arrayBuffer = vi.fn();
    await expect(checkAvatarFile({ size: AVATAR_MAX_BYTES + 1, arrayBuffer })).rejects.toThrow(AVATAR_MESSAGES.tooLarge);
    expect(arrayBuffer).not.toHaveBeenCalled();
    const exactly = new Uint8Array(AVATAR_MAX_BYTES);
    exactly.set(png(100, 100));
    await expect(checkAvatarFile(file(exactly, 'big.png'))).resolves.toMatchObject({ type: 'image/png' });
  });

  it('refuses empty files, unreadable headers and images with too many pixels', async () => {
    await expect(checkAvatarFile(file(new Uint8Array(0)))).rejects.toThrow(AVATAR_MESSAGES.empty);
    await expect(checkAvatarFile(null)).rejects.toThrow(AVATAR_MESSAGES.empty);
    await expect(checkAvatarFile(file(png(0, 10), 'x.png'))).rejects.toThrow(AVATAR_MESSAGES.unreadable);
    await expect(checkAvatarFile(file(png(20000, 20000), 'bomb.png'))).rejects.toThrow(AVATAR_MESSAGES.tooManyPixels);
    await expect(checkAvatarFile(file(png(1, 1)))).resolves.toBeTruthy();
    const error = await checkAvatarFile(file(bytes('GIF89a'))).catch((failure) => failure);
    expect(error).toBeInstanceOf(AvatarFileError);
  });
});

describe('reencodeAvatar', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const fakeCanvas = (result) => {
    const context = { fillRect: vi.fn(), drawImage: vi.fn() };
    const canvas = {
      getContext: () => context,
      toBlob: vi.fn((callback) => callback(result)),
    };
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => (tag === 'canvas' ? canvas : create(tag)));
    return { canvas, context };
  };

  it('draws the centre square onto a fresh canvas and saves a new JPEG, never the original file', async () => {
    const bitmap = { width: 1200, height: 800, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const reencoded = new Blob(['re-encoded'], { type: 'image/jpeg' });
    const { canvas, context } = fakeCanvas(reencoded);
    const original = file(jpeg(1200, 800, { exif: true }), 'with-gps.jpg');
    const output = await reencodeAvatar(original);

    expect(createImageBitmap).toHaveBeenCalledWith(original, { imageOrientation: 'from-image' });
    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(512);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 200, 0, 800, 800, 0, 0, 512, 512);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.88);
    expect(output).toBe(reencoded); // the canvas's new JPEG, not the original file
    expect(output).not.toBe(original);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('checks the file before decoding it', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn());
    await expect(reencodeAvatar(file(bytes('GIF89a'), 'x.jpg'))).rejects.toThrow(AVATAR_MESSAGES.unsupported);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('explains when the browser cannot decode the photo or cannot make a JPEG', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')));
    await expect(reencodeAvatar(file(png(10, 10), 'x.png'))).rejects.toThrow(AVATAR_MESSAGES.unreadable);

    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10, height: 10, close() {} }));
    fakeCanvas(new Blob(['png'], { type: 'image/png' })); // a browser that ignored the JPEG request
    await expect(reencodeAvatar(file(png(10, 10), 'x.png'))).rejects.toThrow(AVATAR_MESSAGES.encodeFailed);
  });
});
