begin;
insert into public.inspections(id,owner_id,idempotency_key,fingerprint,image_count,status) values
('11111111-1111-4111-8111-111111111111','cropdoc_test_a','isolation_a','a',1,'ready'),
('22222222-2222-4222-8222-222222222222','cropdoc_test_b','isolation_b','b',1,'ready');
insert into public.inspection_images(inspection_id,owner_id,path,position,width,height,bytes) values
('11111111-1111-4111-8111-111111111111','cropdoc_test_a','cropdoc_test_a/test/0.jpg',0,10,10,10),
('22222222-2222-4222-8222-222222222222','cropdoc_test_b','cropdoc_test_b/test/0.jpg',0,10,10,10);
insert into public.analysis_reports(inspection_id,owner_id,report,model) values
('11111111-1111-4111-8111-111111111111','cropdoc_test_a','{}','test'),
('22222222-2222-4222-8222-222222222222','cropdoc_test_b','{}','test');
insert into public.device_tokens(owner_id,name,token_hash,prefix) values('cropdoc_test_a','test','test-only-hash','test');
insert into storage.objects(bucket_id,name) values('crop-images','cropdoc_test_a/test/0.jpg'),('crop-images','cropdoc_test_b/test/0.jpg');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cropdoc_test_a","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.inspections)<>1 then raise exception 'RLS inspections isolation failed'; end if;
 if (select count(*) from public.inspection_images)<>1 then raise exception 'RLS images isolation failed'; end if;
 if (select count(*) from public.analysis_reports)<>1 then raise exception 'RLS reports isolation failed'; end if;
 if (select count(*) from storage.objects where bucket_id='crop-images')<>1 then raise exception 'RLS storage isolation failed'; end if;
 begin perform token_hash from public.device_tokens; raise exception 'Token hash was readable'; exception when insufficient_privilege then null; end;
 begin update public.inspections set owner_id='stolen'; raise exception 'User write was allowed'; exception when insufficient_privilege then null; end;
 begin perform public.claim_openai_analysis('cropdoc_test_b','22222222-2222-4222-8222-222222222222',false); raise exception 'Privileged RPC was callable'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 begin insert into public.inspection_images(inspection_id,owner_id,path,position,width,height,bytes) values('11111111-1111-4111-8111-111111111111','cropdoc_test_b','cross-owner-test',1,10,10,10);raise exception 'Cross-owner FK allowed';exception when foreign_key_violation then null;end;
end $$;
insert into public.deleted_users(owner_id) values('cropdoc_test_a');
set local role authenticated;
do $$ begin
 if exists(select 1 from public.inspections) then raise exception 'Deleted user still reads reports'; end if;
 if exists(select 1 from storage.objects where bucket_id='crop-images') then raise exception 'Deleted user still reads storage'; end if;
end $$;
reset role;
-- An exhausted cap blocks paid attempts before any provider call.
update public.ai_budget set charged_microusd=1000000,limit_microusd=1040000 where id=1;
do $$ begin
 perform public.claim_openai_analysis('cropdoc_test_b','22222222-2222-4222-8222-222222222222',false);
 raise exception 'Budget cap not enforced';
exception when others then
 if sqlerrm<>'BUDGET_EXHAUSTED' then raise; end if;
end $$;
-- A claim reserves $0.05; finishing replaces the reservation with the real cost.
update public.ai_budget set limit_microusd=6000000 where id=1;
do $$ declare c jsonb; begin
 c:=public.claim_openai_analysis('cropdoc_test_b','22222222-2222-4222-8222-222222222222',false);
 if (select charged_microusd from public.ai_budget where id=1)<>1050000 then raise exception 'Reservation not charged'; end if;
 if not exists(select 1 from public.analysis_attempts where id=(c->>'attempt_id')::uuid and provider='openai' and model='gpt-6-luna' and charged_microusd=50000) then raise exception 'Paid attempt not recorded'; end if;
 if not public.finish_openai_analysis('cropdoc_test_b','22222222-2222-4222-8222-222222222222',(c->>'attempt_id')::uuid,null,900,'ANALYSIS_FAILED','test') then raise exception 'Attempt not settled'; end if;
 if (select charged_microusd from public.ai_budget where id=1)<>1000900 then raise exception 'Real cost not settled'; end if;
end $$;
rollback;
select 'RLS, Storage, ownership constraints, deleted-account access and capped OpenAI cost accounting passed' as result;
