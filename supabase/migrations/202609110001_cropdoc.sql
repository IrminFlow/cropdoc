-- All write paths are trusted server operations; browser reads still use Clerk RLS.
create table public.deleted_users (owner_id text primary key, created_at timestamptz not null default now());
create table public.device_tokens (
 id uuid primary key default gen_random_uuid(), owner_id text not null,
 name text not null check (length(name) between 1 and 60), token_hash text not null unique,
 prefix text not null, created_at timestamptz not null default now(), revoked_at timestamptz,
 unique (id, owner_id)
);
create table public.inspections (
 id uuid primary key default gen_random_uuid(), owner_id text not null,
 device_token_id uuid, idempotency_key text not null, fingerprint text not null,
 crop_hint text not null default '', location text not null default '', notes text not null default '',
 status text not null default 'uploading' check(status in ('uploading','ready','analyzing','complete','failed','deleting')),
 image_count int not null check(image_count between 1 and 4),
 lease_id uuid, lease_until timestamptz, error_code text, error_message text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_id,idempotency_key), unique(id,owner_id),
 foreign key(device_token_id,owner_id) references public.device_tokens(id,owner_id),
 check(length(crop_hint)<=80 and length(location)<=120 and length(notes)<=500)
);
create index inspections_history on public.inspections(owner_id,created_at desc);
create index inspections_device on public.inspections(device_token_id);
create index device_tokens_owner on public.device_tokens(owner_id);
create table public.inspection_images (
 id uuid primary key default gen_random_uuid(), inspection_id uuid not null, owner_id text not null,
 path text not null unique, position int not null check(position between 0 and 3),
 width int not null, height int not null, bytes int not null,
 unique(inspection_id,position),
 foreign key(inspection_id,owner_id) references public.inspections(id,owner_id) on delete cascade
);
create index inspection_images_owner on public.inspection_images(owner_id);
create table public.analysis_reports (
 inspection_id uuid primary key, owner_id text not null, report jsonb not null,
 model text not null, created_at timestamptz not null default now(),
 foreign key(inspection_id,owner_id) references public.inspections(id,owner_id) on delete cascade,
 check(jsonb_typeof(report)='object')
);
create index analysis_reports_owner on public.analysis_reports(owner_id);
create table public.ai_budget (
 id int primary key check(id=1), limit_microusd bigint not null default 1000000,
 charged_microusd bigint not null default 0 check(charged_microusd>=0)
);
insert into public.ai_budget(id) values(1);
create table public.analysis_attempts (
 id uuid primary key, inspection_id uuid references public.inspections(id) on delete set null,
 owner_id text not null, created_at timestamptz not null default now(),
 charged_microusd bigint not null default 50000, settled boolean not null default false
);
create index analysis_attempts_quota on public.analysis_attempts(owner_id,created_at);
create table public.daily_usage (
 owner_id text not null, day date not null, attempts int not null default 0,
 primary key(owner_id,day)
);

alter table public.inspections enable row level security;
alter table public.inspection_images enable row level security;
alter table public.analysis_reports enable row level security;
alter table public.device_tokens enable row level security;
alter table public.analysis_attempts enable row level security;
alter table public.daily_usage enable row level security;
alter table public.ai_budget enable row level security;
alter table public.deleted_users enable row level security;
revoke all on public.inspections,public.inspection_images,public.analysis_reports,public.device_tokens,public.analysis_attempts,public.daily_usage,public.ai_budget,public.deleted_users from anon, authenticated;
grant select on public.inspections,public.inspection_images,public.analysis_reports,public.daily_usage to authenticated;
grant select(id,owner_id,name,prefix,created_at,revoked_at) on public.device_tokens to authenticated;
create policy own_inspections on public.inspections for select to authenticated using(owner_id=(select auth.jwt()->>'sub') and not exists(select 1 from public.deleted_users d where d.owner_id=(select auth.jwt()->>'sub')));
-- deleted_users is only read via a narrow helper, not exposed to users.
create or replace function public.cropdoc_active_user() returns boolean language sql stable security definer set search_path='' as $$ select not exists(select 1 from public.deleted_users where owner_id=(select auth.jwt()->>'sub')) $$;
revoke all on function public.cropdoc_active_user() from public,anon;
grant execute on function public.cropdoc_active_user() to authenticated;
drop policy own_inspections on public.inspections;
create policy own_inspections on public.inspections for select to authenticated using(owner_id=(select auth.jwt()->>'sub') and (select public.cropdoc_active_user()));
create policy own_images on public.inspection_images for select to authenticated using(owner_id=(select auth.jwt()->>'sub') and (select public.cropdoc_active_user()));
create policy own_reports on public.analysis_reports for select to authenticated using(owner_id=(select auth.jwt()->>'sub') and (select public.cropdoc_active_user()));
create policy own_tokens on public.device_tokens for select to authenticated using(owner_id=(select auth.jwt()->>'sub') and (select public.cropdoc_active_user()));
create policy own_usage on public.daily_usage for select to authenticated using(owner_id=(select auth.jwt()->>'sub'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('crop-images','crop-images',false,800000,array['image/jpeg']);
create policy cropdoc_private_images on storage.objects for select to authenticated
using(bucket_id='crop-images' and (storage.foldername(name))[1]=(select auth.jwt()->>'sub') and (select public.cropdoc_active_user()));

create function public.prepare_inspection(p_owner text,p_key text,p_fingerprint text,p_device uuid,p_crop text,p_location text,p_notes text,p_count int)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.inspections; acquired boolean:=false;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner,0));
 if exists(select 1 from public.deleted_users where owner_id=p_owner) then raise exception 'ACCOUNT_DELETED'; end if;
 if p_device is not null and not exists(select 1 from public.device_tokens where id=p_device and owner_id=p_owner and revoked_at is null) then raise exception 'TOKEN_REVOKED'; end if;
 select * into v from public.inspections where owner_id=p_owner and idempotency_key=p_key for update;
 if found then
   if v.fingerprint<>p_fingerprint or v.device_token_id is distinct from p_device then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   if v.status='uploading' and v.lease_until<now() then
     update public.inspections set lease_id=gen_random_uuid(),lease_until=now()+interval '120 seconds',updated_at=now() where id=v.id returning * into v; acquired:=true;
   end if;
 else
   if (select count(*) from public.inspections where owner_id=p_owner)>=100 then raise exception 'STORAGE_QUOTA'; end if;
   if (select count(*) from public.inspections where owner_id=p_owner and lease_until>now() and status in ('uploading','analyzing'))>=2 then raise exception 'BUSY'; end if;
   insert into public.inspections(owner_id,idempotency_key,fingerprint,device_token_id,crop_hint,location,notes,image_count,lease_id,lease_until)
   values(p_owner,p_key,p_fingerprint,p_device,p_crop,p_location,p_notes,p_count,gen_random_uuid(),now()+interval '120 seconds') returning * into v; acquired:=true;
 end if;
 return jsonb_build_object('inspection',to_jsonb(v),'acquired',acquired);
end $$;

create function public.claim_analysis(p_owner text,p_id uuid,p_retry boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.inspections; b public.ai_budget; a uuid; n int; d date:=(now() at time zone 'Asia/Kolkata')::date;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner,0));
 if exists(select 1 from public.deleted_users where owner_id=p_owner) then raise exception 'ACCOUNT_DELETED'; end if;
 select * into v from public.inspections where id=p_id and owner_id=p_owner for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if v.status='complete' or (v.status='analyzing' and v.lease_until>now()) then return jsonb_build_object('acquired',false); end if;
 if v.status in ('deleting','uploading') then raise exception 'NOT_READY'; end if;
 if v.status in ('failed','analyzing') and not p_retry then return jsonb_build_object('acquired',false); end if;
 if (select count(*) from public.inspection_images where inspection_id=p_id)<>v.image_count then raise exception 'NOT_READY'; end if;
 if v.device_token_id is not null and not exists(select 1 from public.device_tokens where id=v.device_token_id and revoked_at is null) then raise exception 'TOKEN_REVOKED'; end if;
 select * into b from public.ai_budget where id=1 for update;
 insert into public.daily_usage(owner_id,day) values(p_owner,d) on conflict do nothing;
 select attempts into n from public.daily_usage where owner_id=p_owner and day=d for update;
 if n>=5 then raise exception 'DAILY_QUOTA'; end if;
 if b.charged_microusd+50000>b.limit_microusd then raise exception 'BUDGET_EXHAUSTED'; end if;
 a:=gen_random_uuid();
 update public.ai_budget set charged_microusd=charged_microusd+50000 where id=1;
 update public.daily_usage set attempts=attempts+1 where owner_id=p_owner and day=d;
 insert into public.analysis_attempts(id,inspection_id,owner_id) values(a,p_id,p_owner);
 update public.inspections set status='analyzing',lease_id=a,lease_until=now()+interval '120 seconds',error_code=null,error_message=null,updated_at=now() where id=p_id;
 return jsonb_build_object('acquired',true,'attempt_id',a);
end $$;

create function public.finish_analysis(p_owner text,p_id uuid,p_attempt uuid,p_report jsonb,p_cost bigint,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v public.inspections; a public.analysis_attempts;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner,0));
 select * into v from public.inspections where id=p_id and owner_id=p_owner for update;
 if not found or v.lease_id<>p_attempt or v.status<>'analyzing' then return false; end if;
 if exists(select 1 from public.deleted_users where owner_id=p_owner) then return false; end if;
 select * into a from public.analysis_attempts where id=p_attempt for update;
 if not found or a.settled then return false; end if;
 if p_cost is not null then
   if p_cost<0 then raise exception 'INVALID_COST'; end if;
   update public.ai_budget set charged_microusd=charged_microusd-a.charged_microusd+p_cost where id=1;
   update public.analysis_attempts set charged_microusd=p_cost,settled=true where id=p_attempt;
 else update public.analysis_attempts set settled=true where id=p_attempt;
 end if;
 if p_report is not null then
  insert into public.analysis_reports(inspection_id,owner_id,report,model) values(p_id,p_owner,p_report,'gpt-5.6-luna') on conflict(inspection_id) do update set report=excluded.report;
 end if;
 update public.inspections set status=case when p_report is null then 'failed' else 'complete' end,
 error_code=case when p_report is null then 'ANALYSIS_FAILED' else null end,error_message=p_error,lease_until=null,updated_at=now() where id=p_id;
 return true;
end $$;

create function public.create_device_token(p_owner text,p_name text,p_hash text,p_prefix text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner,0));
 if exists(select 1 from public.deleted_users where owner_id=p_owner) then raise exception 'ACCOUNT_DELETED'; end if;
 if (select count(*) from public.device_tokens where owner_id=p_owner and revoked_at is null)>=10 then raise exception 'TOKEN_LIMIT'; end if;
 insert into public.device_tokens(owner_id,name,token_hash,prefix) values(p_owner,p_name,p_hash,p_prefix) returning id into v; return v;
end $$;

revoke all on function public.prepare_inspection(text,text,text,uuid,text,text,text,int),public.claim_analysis(text,uuid,boolean),public.finish_analysis(text,uuid,uuid,jsonb,bigint,text),public.create_device_token(text,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_inspection(text,text,text,uuid,text,text,text,int),public.claim_analysis(text,uuid,boolean),public.finish_analysis(text,uuid,uuid,jsonb,bigint,text),public.create_device_token(text,text,text,text) to service_role;
