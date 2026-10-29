-- Phone key (docs/superpowers/specs/2026-10-29-phone-key-design.md). Synthetic identities only.
begin;
-- 1. the key and its variants
do $$ begin
 if private.phone_key('+5491112341234')<>'541112341234' then raise exception 'AR mobile 9 not dropped'; end if;
 if private.phone_key('+541112341234')<>'541112341234' then raise exception 'AR without 9 changed'; end if;
 if private.phone_key('5491112341234')<>'541112341234' then raise exception 'Digits-only AR mobile not keyed'; end if;
 if private.phone_key('+54 9 11 1234 1234')<>'541112341234' then raise exception 'Spaces not removed'; end if;
 if private.phone_key('+5493511234567')<>'543511234567' then raise exception 'Cordoba mobile not keyed'; end if;
 if private.phone_key('+13055550123')<>'13055550123' then raise exception 'US number changed'; end if;
 if private.phone_key('+447700900834')<>'447700900834' then raise exception 'UK number changed'; end if;
 if private.phone_key('549123456789')<>'549123456789' then raise exception '549 with nine digits must stay'; end if;
 if private.phone_key(null)<>'' or private.phone_key('abc')<>'' then raise exception 'Null and letters must give the empty string'; end if;
 if private.phone_variants('541112341234')<>array['541112341234','5491112341234'] then raise exception 'AR variants wrong'; end if;
 if private.phone_variants('447700900834')<>array['447700900834'] then raise exception 'UK variants wrong'; end if;
 if private.phone_variants('5491112341234')<>array['5491112341234'] then raise exception 'A 9 form is not a key: itself only'; end if;
end $$;
-- closed to clients
set local role authenticated;
do $$ begin
 begin perform private.phone_key('1'); raise exception 'authenticated ran phone_key';
 exception when insufficient_privilege or undefined_function then null; end;
end $$;
reset role;
rollback;
