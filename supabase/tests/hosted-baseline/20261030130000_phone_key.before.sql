-- Rehearsal for 20261030130000_phone_key (hosted-baseline mode only); .after.sql removes everything here.
-- 1. Data in the pre-migration shape: accounts with older Argentine numbers (one to rewrite, one already right, a
-- colliding pair that both stay, one with a pending number change to rewrite too) and a UK account that is untouched.
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values
 ('e2000000-0000-4000-8000-000000000001',null,null,'541112340001',now()),
 ('e2000000-0000-4000-8000-000000000002',null,null,'5491112340002',now()),
 ('e2000000-0000-4000-8000-000000000003',null,null,'541112340003',now()),
 ('e2000000-0000-4000-8000-000000000004',null,null,'5491112340003',now()),
 ('e2000000-0000-4000-8000-000000000005',null,null,'447700900805',now()),
 ('e2000000-0000-4000-8000-000000000006',null,null,'541112340006',now());
update auth.users set phone_change='541112340066' where id='e2000000-0000-4000-8000-000000000006';
insert into public.profiles(id,display_name) values ('e2000000-0000-4000-8000-000000000005','Rehearsal owner');

-- 2. One plan with a duplicate pair (the same number in two spellings: the earlier unanswered one and the later
-- answered one) and a lone invitation, plus a test code.
insert into public.plans(id,owner_id,title,starts_at,time_zone,place_label,categories) values
 ('e2100000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000005','Rehearsal key picnic','2099-07-01 12:00+00','UTC','Park',array['community']);
insert into private.phone_invitations(plan_id,phone,country,invited_by,user_id,answered_at,created_at) values
 ('e2100000-0000-4000-8000-000000000001','541112347777','54','e2000000-0000-4000-8000-000000000005',null,null,now()-interval '2 days'),
 ('e2100000-0000-4000-8000-000000000001','5491112347777','54','e2000000-0000-4000-8000-000000000005','e2000000-0000-4000-8000-000000000002',now()-interval '1 day',now()-interval '1 day'),
 ('e2100000-0000-4000-8000-000000000001','5491112348888','54','e2000000-0000-4000-8000-000000000005',null,null,now());
insert into private.test_codes(phone,otp,sent_at) values ('5491112340001','111111',now());
