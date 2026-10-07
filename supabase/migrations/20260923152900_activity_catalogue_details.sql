-- Complete the live detail shape without publishing or changing any activity.
alter table public.activities
  add column duration_minutes integer
    check (duration_minutes between 1 and 1440),
  add column tips text[] not null default '{}'
    check (cardinality(tips) <= 12 and array_position(tips, null) is null);

comment on column public.activities.duration_minutes is
  'Optional editorial duration in minutes; null means no suggested duration.';
comment on column public.activities.tips is
  'Reviewed activity suggestions. Publication still uses the existing published flag and tester RLS.';
