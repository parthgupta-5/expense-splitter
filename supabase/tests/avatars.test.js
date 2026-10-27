// Profile photos: the 2026103001 migration run for real in PGlite against a stand-in for Supabase Storage's tables.
// Each query runs as a specific user (or anon) with Row Level Security on, as the Storage API does.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  as, createDatabase, createUser, errorAs, newId, runMigration,
} from './harness.js';

const MIGRATION = '2026103001_avatar_storage.sql';
const ROLLBACK = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'rollbacks', '2026103001_avatar_storage.down.sql'),
  'utf8',
);
const HOST = 'https://abcdefghijklmnop.supabase.co';
const photoPath = (user) => `${user.id}/${newId()}.jpg`;
const photoUrl = (objectPath) => `${HOST}/storage/v1/object/public/avatars/${objectPath}`;

const upload = (db, user, name, bucket = 'avatars') => as(db, user, (tx) => tx.query(
  'insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, name],
));
const uploadError = (db, user, name, bucket) => errorAs(db, user, (tx) => tx.query(
  'insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket || 'avatars', name],
));
const countObjects = async (db, name) => Number((await db.query(
  'select count(*) from storage.objects where name = $1', [name],
)).rows[0].count);
const setAvatar = (db, user, url) => as(db, user, (tx) => tx.query(
  'update profiles set avatar_url = $2 where id = $1', [user.id, url],
));
const avatarOf = async (db, user) => (await db.query('select avatar_url from profiles where id = $1', [user.id])).rows[0].avatar_url;

describe('avatars bucket', () => {
  it('is public, small and JPEG-only', async () => {
    const db = await createDatabase();
    expect((await db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'")).rows)
      .toEqual([{ public: true, file_size_limit: 1048576, allowed_mime_types: ['image/jpeg'] }]);
    await runMigration(db, MIGRATION); // safe to re-run
    expect(Number((await db.query("select count(*) from storage.buckets where id = 'avatars'")).rows[0].count)).toBe(1);
  });
});

describe('Storage policies', () => {
  it('let a signed-in user upload only <their id>/<random uuid>.jpg', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    const ben = await createUser(db, 'Ben');
    const own = photoPath(asha);
    await upload(db, asha, own);
    expect(await countObjects(db, own)).toBe(1);

    for (const name of [
      photoPath(ben), // another user's folder
      `${asha.id}/${newId()}.png`, // not the re-encoded JPEG
      `${asha.id}/photo.jpg`, // guessable name
      `${asha.id}/sub/${newId()}.jpg`,
      `${asha.id}/../${ben.id}/${newId()}.jpg`,
      `${newId()}.jpg`,
      `${asha.id}/${newId().toUpperCase()}.jpg`,
      `${asha.id}/${newId()}.jpg/x`,
    ]) {
      expect(await uploadError(db, asha, name), name).toMatch(/row-level security/);
    }
    expect(await uploadError(db, asha, photoPath(asha), 'other-bucket')).toMatch(/row-level security|foreign key/);
  });

  it('never let anyone read, change or delete another user\'s photo object', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    const ben = await createUser(db, 'Ben');
    const bens = photoPath(ben);
    await upload(db, ben, bens);

    await as(db, asha, async (tx) => {
      expect((await tx.query('select name from storage.objects')).rows).toEqual([]);
      expect((await tx.query('delete from storage.objects where name = $1', [bens])).affectedRows).toBe(0);
      expect((await tx.query("update storage.objects set name = $2 where name = $1", [bens, photoPath(asha)])).affectedRows).toBe(0);
    });
    expect(await countObjects(db, bens)).toBe(1);

    await as(db, ben, async (tx) => {
      expect((await tx.query('select name from storage.objects')).rows.map((row) => row.name)).toEqual([bens]);
      // Renaming into someone else's folder is refused too.
      await expect(tx.query('update storage.objects set name = $2 where name = $1', [bens, photoPath(asha)]))
        .rejects.toThrow(/row-level security/);
    });
    await as(db, ben, async (tx) => {
      expect((await tx.query('delete from storage.objects where name = $1', [bens])).affectedRows).toBe(1);
    });
  });

  it('give signed-out visitors nothing: no listing, no uploads', async () => {
    const db = await createDatabase();
    const ben = await createUser(db, 'Ben');
    await upload(db, ben, photoPath(ben));
    await as(db, null, async (tx) => {
      expect((await tx.query('select name from storage.objects')).rows).toEqual([]);
    });
    expect(await uploadError(db, null, photoPath(ben))).toMatch(/row-level security/);
  });
});

describe('profiles.avatar_url', () => {
  it('accepts only the owner\'s own photo URL, and clears blanks', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    const ben = await createUser(db, 'Ben');
    const url = photoUrl(photoPath(asha));
    await setAvatar(db, asha, url);
    expect(await avatarOf(db, asha)).toBe(url);

    for (const bad of [
      photoUrl(photoPath(ben)), // someone else's photo
      'https://evil.example/tracker.jpg',
      url.replace('https://', 'http://'),
      url.replace('/public/avatars/', '/public/other/'),
      url + '?x=1',
      'javascript:alert(1)',
    ]) {
      expect(await errorAs(db, asha, (tx) => tx.query('update profiles set avatar_url = $2 where id = $1', [asha.id, bad])), bad)
        .toMatch(/Upload a profile photo from Settings/);
    }
    expect(await avatarOf(db, asha)).toBe(url);

    await setAvatar(db, asha, '   ');
    expect(await avatarOf(db, asha)).toBeNull();
  });

  it('leaves a link saved by an older version alone while other fields change', async () => {
    const db = await createDatabase({ upTo: MIGRATION.slice(0, 10) });
    const asha = await createUser(db, 'Asha');
    await db.query("update profiles set avatar_url = 'https://old.example/me.png' where id = $1", [asha.id]);
    await runMigration(db, MIGRATION);
    await as(db, asha, (tx) => tx.query("update profiles set display_name = 'Asha R' where id = $1", [asha.id]));
    expect(await avatarOf(db, asha)).toBe('https://old.example/me.png');
  });

  it('is still readable and writable only by its owner', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    const ben = await createUser(db, 'Ben');
    await as(db, ben, async (tx) => {
      expect((await tx.query('update profiles set avatar_url = null where id = $1', [asha.id])).affectedRows).toBe(0);
      expect((await tx.query('select avatar_url from profiles where id = $1', [asha.id])).rows).toEqual([]);
    });
  });
});

describe('rollback script', () => {
  it('stops serving and accepting photos without deleting any, and re-applying restores them', async () => {
    const db = await createDatabase();
    const asha = await createUser(db, 'Asha');
    const own = photoPath(asha);
    await upload(db, asha, own);
    await setAvatar(db, asha, photoUrl(own));

    await db.exec(ROLLBACK);
    await db.exec(ROLLBACK); // safe to re-run
    expect((await db.query("select public from storage.buckets where id = 'avatars'")).rows[0].public).toBe(false);
    expect(await uploadError(db, asha, photoPath(asha))).toMatch(/row-level security/);
    expect(await countObjects(db, own)).toBe(1);
    expect(await avatarOf(db, asha)).toBe(photoUrl(own));

    await runMigration(db, MIGRATION);
    expect((await db.query("select public from storage.buckets where id = 'avatars'")).rows[0].public).toBe(true);
    await upload(db, asha, photoPath(asha));
  });
});
