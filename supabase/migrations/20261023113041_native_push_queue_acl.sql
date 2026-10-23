-- Historical attempt: hosted owner is supabase_admin; postgres cannot revoke
-- these grants. Readback showed no effect. Signed dispatch below is the fix.
revoke all on table net.http_request_queue, net._http_response from public,anon,authenticated,service_role;
grant all on table net.http_request_queue, net._http_response to postgres;
