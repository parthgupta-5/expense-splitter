import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// The profile-photo re-encode in a real browser (Chromium, desktop and phone): JPG, PNG and WebP become a fresh
// 512 x 512 JPEG, and a photo carrying EXIF with a GPS position comes out with no metadata at all. The module is
// loaded on its own (it has no imports), so no account or network is needed.

const MODULE = '/__avatar-test/avatarImage.js';

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, body: '' }));
  const source = await readFile(new URL('../src/lib/avatarImage.js', import.meta.url), 'utf8');
  await page.route(`**${MODULE}`, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: source }));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.errors = errors;
  await page.goto('/settings');
});

test.afterEach(async ({ page }) => {
  expect(page.errors, 'no errors in the browser console').toEqual([]);
});

test('JPG, PNG and WebP photos become a clean 512 x 512 JPEG; EXIF and GPS are removed', async ({ page }) => {
  const results = await page.evaluate(async (modulePath) => {
    const { reencodeAvatar } = await import(modulePath);
    const ascii = (text) => Array.from(text, (char) => char.charCodeAt(0));
    const contains = (bytes, text) => {
      const needle = ascii(text);
      for (let i = 0; i <= bytes.length - needle.length; i += 1) {
        if (needle.every((value, j) => bytes[i + j] === value)) return true;
      }
      return false;
    };
    const draw = (width, height, type) => new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#336699';
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#ffcc00';
      context.fillRect(width / 4, height / 4, width / 2, height / 2);
      canvas.toBlob(resolve, type, 0.9);
    });
    // A camera-style JPEG: an APP1 "Exif" segment with a GPS position, inserted right after the start marker.
    const withExif = async (jpeg) => {
      const bytes = new Uint8Array(await jpeg.arrayBuffer());
      const payload = [...ascii('Exif'), 0, 0, ...ascii('MM GPSLatitude 12.9716N GPSLongitude 77.5946E Model PhoneCam')];
      const length = payload.length + 2;
      const segment = [0xff, 0xe1, length >> 8, length & 255, ...payload];
      return new Blob([bytes.subarray(0, 2), new Uint8Array(segment), bytes.subarray(2)], { type: 'image/jpeg' });
    };

    const sources = {
      'jpg with gps': new File([await withExif(await draw(1200, 800, 'image/jpeg'))], 'IMG_0001.JPG', { type: 'image/jpeg' }),
      png: new File([await draw(300, 600, 'image/png')], 'drawing.png', { type: 'image/png' }),
      webp: new File([await draw(1024, 1024, 'image/webp')], 'photo.webp', { type: 'image/webp' }),
    };
    const out = {};
    for (const [name, file] of Object.entries(sources)) {
      const input = new Uint8Array(await file.arrayBuffer());
      const result = await reencodeAvatar(file);
      const bytes = new Uint8Array(await result.arrayBuffer());
      const bitmap = await createImageBitmap(result);
      out[name] = {
        inputHadGps: contains(input, 'GPSLatitude'),
        inputType: file.type,
        type: result.type,
        startsAsJpeg: bytes[0] === 0xff && bytes[1] === 0xd8,
        width: bitmap.width,
        height: bitmap.height,
        hasExif: contains(bytes, 'Exif'),
        hasGps: contains(bytes, 'GPSLatitude') || contains(bytes, '12.9716'),
        hasCameraModel: contains(bytes, 'PhoneCam'),
        bytes: bytes.length,
      };
    }
    return out;
  }, MODULE);

  expect(results['jpg with gps'].inputHadGps).toBe(true); // the test photo really carried a location
  for (const [name, result] of Object.entries(results)) {
    expect(result, name).toMatchObject({
      type: 'image/jpeg', startsAsJpeg: true, width: 512, height: 512, hasExif: false, hasGps: false, hasCameraModel: false,
    });
    expect(result.bytes, name).toBeLessThan(1024 * 1024); // fits the bucket's 1 MB limit
  }
});

test('GIF, SVG, PDF, HEIC-style and oversized files are refused before decoding', async ({ page }) => {
  const messages = await page.evaluate(async (modulePath) => {
    const { reencodeAvatar } = await import(modulePath);
    const tryFile = (parts, name, type) => reencodeAvatar(new File(parts, name, { type })).then(() => 'accepted', (error) => error.message);
    const gif = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='), (char) => char.charCodeAt(0));
    return {
      gif: await tryFile([gif], 'animated.gif', 'image/gif'),
      gifRenamed: await tryFile([gif], 'photo.jpg', 'image/jpeg'),
      svg: await tryFile(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], 'logo.svg', 'image/svg+xml'),
      pdf: await tryFile(['%PDF-1.7\n'], 'cv.pdf', 'application/pdf'),
      heic: await tryFile([new Uint8Array([0, 0, 0, 0x18, ...Array.from('ftypheic', (c) => c.charCodeAt(0))])], 'IMG.HEIC', 'image/heic'),
      tooBig: await tryFile([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.jpg', 'image/jpeg'),
    };
  }, MODULE);
  expect(messages).toEqual({
    gif: 'Use a JPG, PNG or WebP photo.',
    gifRenamed: 'Use a JPG, PNG or WebP photo.',
    svg: 'Use a JPG, PNG or WebP photo.',
    pdf: 'Use a JPG, PNG or WebP photo.',
    heic: 'Use a JPG, PNG or WebP photo.',
    tooBig: 'Choose a photo under 5 MB.',
  });
});

test('guests see no profile photo controls', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: /upload photo/i })).toHaveCount(0);
  await expect(page.locator('input[type="file"][accept^="image/jpeg"]')).toHaveCount(0);
});
