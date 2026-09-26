-- Applied via Supabase migration API at 2026-09-26T14:06:54Z.
-- Supabase's default ACL granted anon EXECUTE directly. Revoking PUBLIC
-- alone does not remove that grant. Preserve authenticated owner RPCs and
-- the three deliberately public, bearer-token-gated customer RPCs.
revoke execute on function
  public.accept_current_policies(text,text),
  public.append_owner_note(uuid,text),
  public.create_addon_request(uuid,text,integer,uuid),
  public.create_job_from_templates(uuid,uuid[],text,date,text,text,text,text,uuid),
  public.register_workspace_revision_portal(text,text,boolean),
  public.revert_revision_request(uuid,text,uuid),
  public.rotate_revision_portal(uuid),
  public.save_workspace_document(jsonb,bigint,uuid),
  public.set_addon_status(uuid,text),
  public.set_job_status(uuid,text),
  public.set_job_task_status(uuid,text),
  public.set_revision_portal_enabled(uuid,boolean),
  public.submit_manual_revision_request(uuid,text,text,text,text,uuid),
  public.update_job_links(uuid,text,text)
from public, anon;

-- Trigger functions are invoked by triggers, never as client RPCs.
-- Their owner and service_role privileges remain unchanged.
revoke execute on function
  public.handle_new_user(),
  public.protect_revision_request_evidence(),
  public.record_signup_policy_acceptance(),
  public.validate_revision_event_chain()
from public, anon, authenticated;

notify pgrst, 'reload schema';
