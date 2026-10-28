import { describe, expect, it } from 'vitest';
import {
  managedAvatarSrc, memberAvatarSrc, newAvatarPath, ownAvatarPath,
} from './avatarUrl';

const PROJECT = 'https://abcdefghijklmnop.supabase.co';
const ME = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-8888-4777-8666-555555555555';
const FILE = '0f8fad5b-d9cb-469f-a165-70867728950e.jpg';
const url = (folder = ME, file = FILE, host = PROJECT) => `${host}/storage/v1/object/public/avatars/${folder}/${file}`;

describe('newAvatarPath', () => {
  it('puts a random v4 uuid name in the user\'s own folder', () => {
    const first = newAvatarPath(ME);
    expect(first).toMatch(new RegExp(`^${ME}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.jpg$`));
    expect(newAvatarPath(ME)).not.toBe(first);
  });
});

describe('ownAvatarPath', () => {
  it('returns the object path of the user\'s own photo in this project', () => {
    expect(ownAvatarPath(url(), ME, PROJECT)).toBe(`${ME}/${FILE}`);
  });

  it('refuses anything it cannot prove is the user\'s own managed photo', () => {
    for (const other of [
      url(OTHER), // someone else's folder
      url(ME, FILE, 'https://other-project.supabase.co'),
      url(ME, FILE, 'http://abcdefghijklmnop.supabase.co'),
      url(ME, 'photo.jpg'),
      url(ME, FILE.replace('.jpg', '.png')),
      url(ME, FILE) + '?download=1',
      url(ME, FILE) + '#x',
      url(`${ME}/sub`),
      url(`${ME}/..`, `${OTHER}/${FILE}`),
      url(ME, '..%2F' + FILE),
      `${PROJECT}/storage/v1/object/public/other-bucket/${ME}/${FILE}`,
      `${PROJECT}/storage/v1/object/sign/avatars/${ME}/${FILE}`,
      'https://old.example/me.png',
      'not a url',
      '',
      null,
    ]) {
      expect(ownAvatarPath(other, ME, PROJECT), String(other)).toBeNull();
    }
    expect(ownAvatarPath(url(), ME, '')).toBeNull();
    expect(ownAvatarPath(url(), 'not-a-uuid', PROJECT)).toBeNull();
  });

  it('shows only a managed photo; anything else falls back to the initial', () => {
    expect(managedAvatarSrc(url(), ME, PROJECT)).toBe(url());
    expect(managedAvatarSrc('https://old.example/tracker.png', ME, PROJECT)).toBeNull();
    expect(managedAvatarSrc(url(OTHER), ME, PROJECT)).toBeNull();
  });
});

describe('memberAvatarSrc (other accounts\' photos, already checked by the database)', () => {
  const project = 'https://abc.supabase.co';
  const user = '11111111-2222-4333-8444-555555555555';
  const file = '66666666-7777-4888-9999-000000000000.jpg';
  it('shows only a managed photo in this project, in its owner\'s folder', () => {
    const url = `${project}/storage/v1/object/public/avatars/${user}/${file}`;
    expect(memberAvatarSrc(url, project)).toBe(url);
    expect(memberAvatarSrc(url, 'https://other.supabase.co')).toBeNull();
    expect(memberAvatarSrc(`${project}/storage/v1/object/public/avatars/${user}/x/${file}`, project)).toBeNull();
    expect(memberAvatarSrc('https://evil.example/track.gif', project)).toBeNull();
    expect(memberAvatarSrc(null, project)).toBeNull();
  });
});
