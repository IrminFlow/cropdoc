-- Change new free attempts only; preserve historical provider records and costs.
create or replace function public.claim_free_analysis(p_owner text,p_id uuid,p_retry boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.inspections; a uuid; n int; d date:=(now() at time zone 'Asia/Kolkata')::date;
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
 insert into public.daily_usage(owner_id,day) values(p_owner,d) on conflict do nothing;
 select attempts into n from public.daily_usage where owner_id=p_owner and day=d for update;
 if n>=5 then raise exception 'DAILY_QUOTA'; end if;
 a:=gen_random_uuid();
 update public.daily_usage set attempts=attempts+1 where owner_id=p_owner and day=d;
 insert into public.analysis_attempts(id,inspection_id,owner_id,provider,model,charged_microusd) values(a,p_id,p_owner,'openrouter','dots-studio/dots-3-note-preview:free',0);
 update public.inspections set status='analyzing',lease_id=a,lease_until=now()+interval '120 seconds',error_code=null,error_message=null,updated_at=now() where id=p_id;
 return jsonb_build_object('acquired',true,'attempt_id',a);
end $$;

create or replace function public.finish_free_analysis(p_owner text,p_id uuid,p_attempt uuid,p_report jsonb,p_error_code text,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v public.inspections; a public.analysis_attempts;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner,0));
 select * into v from public.inspections where id=p_id and owner_id=p_owner for update;
 if not found or v.lease_id<>p_attempt or v.status<>'analyzing' then return false; end if;
 if exists(select 1 from public.deleted_users where owner_id=p_owner) then return false; end if;
 select * into a from public.analysis_attempts where id=p_attempt for update;
 if not found or a.settled then return false; end if;
 if a.provider<>'openrouter' or a.model<>'dots-studio/dots-3-note-preview:free' or a.charged_microusd<>0 or a.owner_id<>p_owner or a.inspection_id<>p_id then return false; end if;
 update public.analysis_attempts set settled=true where id=p_attempt;
 if p_report is not null then
  insert into public.analysis_reports(inspection_id,owner_id,report,provider,model) values(p_id,p_owner,p_report,'openrouter','dots-studio/dots-3-note-preview:free') on conflict(inspection_id) do update set report=excluded.report,provider=excluded.provider,model=excluded.model;
 end if;
 update public.inspections set status=case when p_report is null then 'failed' else 'complete' end,
 error_code=case when p_report is null then case when p_error_code='AI_QUOTA' then 'AI_QUOTA' else 'ANALYSIS_FAILED' end else null end,error_message=p_error,lease_until=null,updated_at=now() where id=p_id;
 return true;
end $$;

revoke all on function public.claim_free_analysis(text,uuid,boolean),public.finish_free_analysis(text,uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.claim_free_analysis(text,uuid,boolean),public.finish_free_analysis(text,uuid,uuid,jsonb,text,text) to service_role;
