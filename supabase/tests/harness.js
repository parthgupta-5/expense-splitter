// Runs the real migrations inside PGlite (Postgres compiled to WebAssembly) with a minimal stand-in for the
// parts of Supabase they rely on: the auth schema, auth.uid(), the anon/authenticated roles and the realtime
// publication. Queries can then be run "as" a signed-in user so Row Level Security is exercised for real.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, '..', 'migrations');

export const migrationFiles = () => readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
// PGlite has no pgcrypto extension; gen_random_uuid() is built into Postgres 13+ so the line is not needed here.
export const readMigration = (file) => readFileSync(path.join(migrationsDir, file), 'utf8')
  .replace(/create extension if not exists pgcrypto;/i, '');

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  create publication supabase_realtime;

  -- Supabase Storage keeps its files' metadata in these tables, with Row Level Security on storage.objects and
  -- table privileges for both roles; the Storage API runs each request as the caller's role.
  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    metadata jsonb,
    created_at timestamptz not null default now(),
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  grant select on storage.buckets to anon, authenticated;
`;

/** Creates a database with the Supabase stub. Pass `upTo` to stop before a migration (for data-migration tests). */
export async function createDatabase({ upTo } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) {
    if (upTo && file >= upTo) break;
    await db.exec(readMigration(file));
  }
  return db;
}

export async function runMigration(db, file) {
  await db.exec(readMigration(file));
}

let counter = 0;
/** Adds an auth user (the profile row is created by the migration's trigger). */
export async function createUser(db, name) {
  counter += 1;
  const id = `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
  const email = `${name.toLowerCase()}${counter}@example.com`;
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
    id, email, JSON.stringify({ display_name: name }),
  ]);
  return { id, email, name };
}

/** Runs `fn(tx)` as the given user (or as anon when user is null), with RLS enforced. */
export async function as(db, user, fn) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user ? user.id : '']);
    await tx.exec(user ? 'set local role authenticated' : 'set local role anon');
    return fn(tx);
  });
}

/** Like `as`, but resolves to the error message (or null if the call succeeded). */
export async function errorAs(db, user, fn) {
  try {
    await as(db, user, fn);
    return null;
  } catch (error) {
    return error.message;
  }
}

export const newId = () => crypto.randomUUID();
