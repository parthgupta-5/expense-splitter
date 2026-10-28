// @vitest-environment jsdom
// Profile photos in Account settings: the real App, workspace and file checks, with the session, Supabase data layer
// and the canvas re-encode mocked (the real re-encode runs in a browser in e2e/avatar.spec.js).
import React from 'react';
import {
  afterEach, beforeAll, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  cleanup, render, screen, waitFor, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import App from './App';
import { AppProvider } from './state/AppContext';
import * as repo from './data/cloudRepo';
import { reencodeAvatar } from './lib/avatarImage';

const PROJECT = 'https://abcdefghijklmnop.supabase.co';
const ME = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-8888-4777-8666-555555555555';
const OLD_FILE = '0f8fad5b-d9cb-469f-a165-70867728950e.jpg';
const NEW_FILE = '7c9e6679-7425-40de-944b-e07fc1f90ae7.jpg';
const photoUrl = (folder, file) => `${PROJECT}/storage/v1/object/public/avatars/${folder}/${file}`;
const OLD_URL = photoUrl(ME, OLD_FILE);
const NEW_URL = photoUrl(ME, NEW_FILE);

const mocks = vi.hoisted(() => ({
  auth: {
    user: {
      id: '11111111-2222-4333-8444-555555555555', email: 'asha@example.com', email_confirmed_at: '2026-10-01T00:00:00Z', user_metadata: {},
    },
    ready: true,
    recovering: false,
    signOut: () => Promise.resolve(),
    updateDisplayName: () => Promise.resolve(),
  },
}));

vi.mock('./supabase', () => ({
  supabase: null, supabaseConfigured: true, normalizeSupabaseUrl: () => '', supabaseUrl: 'https://abcdefghijklmnop.supabase.co',
}));
vi.mock('./state/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('./data/cloudRepo', () => ({
  fetchGroups: vi.fn(),
  fetchGroup: vi.fn(),
  fetchProfile: vi.fn(),
  saveProfile: vi.fn(),
  subscribeToChanges: vi.fn(),
  fetchActivity: vi.fn(),
  importGroup: vi.fn(),
  // Read by the app shell for every signed-in account (invitations in the bell, people statuses, deletion checks).
  listMyInvitations: vi.fn(() => Promise.resolve([])),
  listGroupPeople: vi.fn(() => Promise.resolve([])),
  accountDeletionBlockers: vi.fn(() => Promise.resolve([])),
  checkUsername: vi.fn(),
  suggestUsername: vi.fn(),
  setUsername: vi.fn(),
  uploadAvatar: vi.fn(),
  removeAvatarObject: vi.fn(),
}));
vi.mock('./lib/avatarImage', async (importOriginal) => ({ ...(await importOriginal()), reencodeAvatar: vi.fn() }));

const profile = (avatarUrl = null) => ({
  id: ME, display_name: 'Asha Rao', username: 'asha_rao', username_confirmed_at: '2026-10-01T00:00:00Z',
  avatar_url: avatarUrl, saved_people: [], currency_code: 'INR', preferences: {},
});
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 2, 0, 0, 0, 1, 0x80, 8, 6, 0, 0, 0]);
const pngFile = (name = 'me.png') => new File([PNG_BYTES], name, { type: 'image/png' });
const REENCODED = new Blob(['jpeg pixels'], { type: 'image/jpeg' });

beforeAll(() => {
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent() { return false; },
  }));
  window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
});
beforeEach(() => {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  });
  repo.fetchGroups.mockResolvedValue([]);
  repo.fetchProfile.mockResolvedValue(profile());
  repo.subscribeToChanges.mockReturnValue(() => {});
  repo.fetchActivity.mockResolvedValue([]);
  repo.saveProfile.mockResolvedValue();
  repo.uploadAvatar.mockResolvedValue({ path: `${ME}/${NEW_FILE}`, url: NEW_URL });
  repo.removeAvatarObject.mockResolvedValue();
  reencodeAvatar.mockResolvedValue(REENCODED);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const renderSettings = async () => {
  render(<MemoryRouter initialEntries={['/settings']}><AppProvider><App /></AppProvider></MemoryRouter>);
  await screen.findByRole('heading', { level: 2, name: 'Asha Rao' });
  return within(document.querySelector('.account-card'));
};
const photos = () => Array.from(document.querySelectorAll('.user-avatar img')).map((img) => img.getAttribute('src'));
const fileInput = () => screen.getByLabelText('Profile photo file');

describe('profile photo', () => {
  it('shows the generated initial until a photo is uploaded', async () => {
    const card = await renderSettings();
    expect(photos()).toEqual([]);
    expect(document.querySelector('.account-card .user-avatar').textContent).toBe('A');
    expect(card.getByRole('button', { name: 'Upload photo' })).toBeTruthy();
    expect(card.queryByRole('button', { name: 'Remove photo' })).toBeNull();
    expect(fileInput().getAttribute('accept')).toBe('image/jpeg,image/png,image/webp');
  });

  it('uploads only the re-encoded JPEG, saves it to the profile, and shows it in Settings and the top bar', async () => {
    const user = userEvent.setup();
    const card = await renderSettings();
    const chosen = pngFile();
    await user.upload(fileInput(), chosen);
    await waitFor(() => expect(repo.saveProfile).toHaveBeenCalledWith(ME, { avatar_url: NEW_URL }));
    expect(reencodeAvatar).toHaveBeenCalledWith(chosen);
    expect(repo.uploadAvatar).toHaveBeenCalledWith(ME, REENCODED); // never the original file
    expect(await screen.findByText('Profile photo updated')).toBeTruthy();
    await waitFor(() => expect(photos()).toEqual([NEW_URL, NEW_URL]));
    expect(card.getByRole('button', { name: 'Change photo' })).toBeTruthy();
    expect(repo.removeAvatarObject).not.toHaveBeenCalled(); // there was no previous photo
  });

  it('replaces a photo, then deletes only the previous object in the user\'s own folder', async () => {
    const user = userEvent.setup();
    repo.fetchProfile.mockResolvedValue(profile(OLD_URL));
    await renderSettings();
    expect(photos()).toEqual([OLD_URL, OLD_URL]);
    await user.upload(fileInput(), pngFile());
    await waitFor(() => expect(repo.removeAvatarObject).toHaveBeenCalledWith(`${ME}/${OLD_FILE}`));
    expect(repo.removeAvatarObject).toHaveBeenCalledTimes(1);
    expect(repo.saveProfile.mock.invocationCallOrder[0]).toBeLessThan(repo.removeAvatarObject.mock.invocationCallOrder[0]);
    await waitFor(() => expect(photos()).toEqual([NEW_URL, NEW_URL]));
  });

  it('never shows or deletes a photo URL it cannot prove is the user\'s own', async () => {
    const user = userEvent.setup();
    for (const foreign of ['https://old.example/me.png', photoUrl(OTHER, OLD_FILE), photoUrl(ME, OLD_FILE).replace(PROJECT, 'https://other.supabase.co')]) {
      repo.fetchProfile.mockResolvedValue(profile(foreign));
      const card = await renderSettings();
      expect(photos(), foreign).toEqual([]);
      expect(card.getByRole('button', { name: 'Upload photo' })).toBeTruthy();
      await user.upload(fileInput(), pngFile());
      await waitFor(() => expect(repo.saveProfile).toHaveBeenCalledWith(ME, { avatar_url: NEW_URL }));
      expect(repo.removeAvatarObject, foreign).not.toHaveBeenCalled();
      cleanup();
      vi.clearAllMocks();
      repo.fetchGroups.mockResolvedValue([]);
      repo.subscribeToChanges.mockReturnValue(() => {});
      repo.fetchActivity.mockResolvedValue([]);
      repo.saveProfile.mockResolvedValue();
      repo.uploadAvatar.mockResolvedValue({ path: `${ME}/${NEW_FILE}`, url: NEW_URL });
      reencodeAvatar.mockResolvedValue(REENCODED);
    }
  });

  it('keeps the current photo when saving the new one fails, and cleans up the new upload', async () => {
    const user = userEvent.setup();
    repo.fetchProfile.mockResolvedValue(profile(OLD_URL));
    repo.saveProfile.mockRejectedValue(new Error('Failed to fetch'));
    const card = await renderSettings();
    await user.upload(fileInput(), pngFile());
    expect(await card.findByRole('alert')).toHaveProperty('textContent', expect.stringMatching(/not uploaded: Can't reach the server.*Your current photo is unchanged/));
    expect(repo.removeAvatarObject).toHaveBeenCalledWith(`${ME}/${NEW_FILE}`); // the new, unused object
    expect(repo.removeAvatarObject).not.toHaveBeenCalledWith(`${ME}/${OLD_FILE}`);
    expect(photos()).toEqual([OLD_URL, OLD_URL]);
  });

  it('keeps the current photo when the upload itself fails', async () => {
    const user = userEvent.setup();
    repo.fetchProfile.mockResolvedValue(profile(OLD_URL));
    repo.uploadAvatar.mockRejectedValue(new Error('new row violates row-level security policy'));
    const card = await renderSettings();
    await user.upload(fileInput(), pngFile());
    expect((await card.findByRole('alert')).textContent).toMatch(/You don't have permission/);
    expect(repo.saveProfile).not.toHaveBeenCalled();
    expect(repo.removeAvatarObject).not.toHaveBeenCalled();
    expect(photos()).toEqual([OLD_URL, OLD_URL]);
  });

  it('refuses unsupported and oversized files before preparing or uploading anything', async () => {
    const user = userEvent.setup({ applyAccept: false }); // as if "All files" was picked
    const card = await renderSettings();
    for (const [chosen, message] of [
      [new File(['GIF89a......'], 'renamed.jpg', { type: 'image/jpeg' }), 'Use a JPG, PNG or WebP photo.'],
      [new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'logo.svg', { type: 'image/svg+xml' }), 'Use a JPG, PNG or WebP photo.'],
      [new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' }), 'Use a JPG, PNG or WebP photo.'],
      [new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.jpg', { type: 'image/jpeg' }), 'Choose a photo under 5 MB.'],
    ]) {
      await user.upload(fileInput(), chosen);
      expect((await card.findByRole('alert')).textContent, chosen.name).toBe(message);
    }
    expect(reencodeAvatar).not.toHaveBeenCalled();
    expect(repo.uploadAvatar).not.toHaveBeenCalled();
    expect(repo.saveProfile).not.toHaveBeenCalled();
  });

  it('removes the photo after confirmation, deleting only the user\'s own object', async () => {
    const user = userEvent.setup();
    repo.fetchProfile.mockResolvedValue(profile(OLD_URL));
    const card = await renderSettings();
    await user.click(card.getByRole('button', { name: 'Remove photo' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Remove photo' }).length).toBe(2)); // the confirmation
    await user.click(screen.getAllByRole('button', { name: 'Remove photo' }).at(-1));
    await waitFor(() => expect(repo.saveProfile).toHaveBeenCalledWith(ME, { avatar_url: null }));
    await waitFor(() => expect(repo.removeAvatarObject).toHaveBeenCalledWith(`${ME}/${OLD_FILE}`));
    await waitFor(() => expect(photos()).toEqual([]));
    expect(card.getByRole('button', { name: 'Upload photo' })).toBeTruthy();
  });

  it('keeps the photo when removing it fails', async () => {
    const user = userEvent.setup();
    repo.fetchProfile.mockResolvedValue(profile(OLD_URL));
    repo.saveProfile.mockRejectedValue(new Error('Failed to fetch'));
    const card = await renderSettings();
    await user.click(card.getByRole('button', { name: 'Remove photo' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Remove photo' }).length).toBe(2));
    await user.click(screen.getAllByRole('button', { name: 'Remove photo' }).at(-1));
    expect((await card.findByRole('alert')).textContent).toMatch(/not removed/);
    expect(repo.removeAvatarObject).not.toHaveBeenCalled();
    expect(photos()).toEqual([OLD_URL, OLD_URL]);
  });

  it('runs one upload at a time', async () => {
    const user = userEvent.setup();
    let finish;
    repo.uploadAvatar.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const card = await renderSettings();
    await user.upload(fileInput(), pngFile());
    await waitFor(() => expect(repo.uploadAvatar).toHaveBeenCalledTimes(1));
    expect(card.getByRole('status').textContent).toBe('Uploading your photo…');
    expect(card.getByRole('button', { name: /Upload photo/ }).disabled).toBe(true);
    await user.upload(fileInput(), pngFile('second.png'));
    expect(repo.uploadAvatar).toHaveBeenCalledTimes(1);
    finish({ path: `${ME}/${NEW_FILE}`, url: NEW_URL });
    await waitFor(() => expect(photos()).toEqual([NEW_URL, NEW_URL]));
  });
});
