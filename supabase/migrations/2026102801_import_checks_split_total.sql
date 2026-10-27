-- Run AFTER 2026102701_normalize_and_share.sql. Safe to run repeatedly.
-- import_group() turns on bulk mode so old data with removed people can be imported, but bulk mode also skipped the
-- rule that split amounts add up to the expense total. This keeps every other bulk-import allowance and re-applies
-- the whole-cents and total checks to imported expenses as well.

create or replace function public.validate_expense()
returns trigger language plpgsql set search_path = public as $$
declare
  share record;
  total bigint := 0;
  bulk boolean := public.is_bulk_import();
begin
  if tg_op = 'UPDATE' then
    if new.group_id <> old.group_id then
      raise exception 'An expense cannot be moved to another group' using errcode = '23514';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  else
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  new.updated_at := now();
  new.description := btrim(new.description);

  if not bulk and not public.is_group_person(new.group_id, new.payer) then
    raise exception '% is not in this group', new.payer using errcode = '23514';
  end if;
  if new.split_details = '{}'::jsonb then
    raise exception 'Choose at least one person to split between' using errcode = '23514';
  end if;
  for share in select key, value from jsonb_each(new.split_details) loop
    if jsonb_typeof(share.value) <> 'number'
      or (share.value #>> '{}')::numeric <> trunc((share.value #>> '{}')::numeric)
      or (share.value #>> '{}')::numeric < 0 then
      raise exception 'Split amounts must be whole, non-negative cents' using errcode = '23514';
    end if;
    if not bulk and not public.is_group_person(new.group_id, share.key) then
      raise exception '% is not in this group', share.key using errcode = '23514';
    end if;
    total := total + (share.value #>> '{}')::bigint;
  end loop;
  if total <> new.amount_cents then
    raise exception 'Split amounts must add up to the expense total' using errcode = '23514';
  end if;
  return new;
end;
$$;
