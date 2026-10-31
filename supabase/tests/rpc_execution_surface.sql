-- Read-only regression test. Expected result: 24 rows, all passed=true.
-- Checks effective privileges, including PUBLIC and role inheritance, not SQL text.
with expected(signature, anon_allowed, authenticated_allowed) as (
  values
    ('public.accept_current_policies(text,text)', false, true),
    ('public.append_owner_note(uuid,text)', false, true),
    ('public.create_addon_request(uuid,text,integer,uuid)', false, true),
    ('public.create_job_from_templates(uuid,uuid[],text,date,text,text,text,text,uuid)', false, true),
    ('public.register_workspace_revision_portal(text,text,boolean)', false, true),
    ('public.revert_revision_request(uuid,text,uuid)', false, true),
    ('public.rotate_revision_portal(uuid)', false, true),
    ('public.save_workspace_document(jsonb,bigint,uuid)', false, true),
    ('public.set_addon_status(uuid,text)', false, true),
    ('public.set_job_status(uuid,text)', false, true),
    ('public.set_job_task_status(uuid,text)', false, true),
    ('public.set_revision_portal_enabled(uuid,boolean)', false, true),
    ('public.submit_manual_revision_request(uuid,text,text,text,text,uuid)', false, true),
    ('public.update_job_links(uuid,text,text)', false, true),
    ('public.redeem_invite_code(text)', false, true),
    ('public.handle_new_user()', false, false),
    ('public.protect_revision_request_evidence()', false, false),
    ('public.record_signup_policy_acceptance()', false, false),
    ('public.validate_revision_event_chain()', false, false),
    ('public.purge_deleted_workspace_job_revisions()', false, false),
    ('public.get_workspace_revision_summary(text)', true, true),
    ('public.get_workspace_revision_view(text)', true, true),
    ('public.submit_revision_request(text,text,text,uuid,text)', true, true),
    ('public.submit_workspace_revision_request(text,text,text,uuid)', true, true)
)
select signature,
  coalesce(
    has_function_privilege('anon', to_regprocedure(signature), 'execute') = anon_allowed
    and has_function_privilege('authenticated', to_regprocedure(signature), 'execute') = authenticated_allowed
    and has_function_privilege('service_role', to_regprocedure(signature), 'execute'),
    false
  ) as passed
from expected
order by signature;
