REVOKE ALL ON FUNCTION public.evaluate_event_activation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_event_charges(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_event_users(uuid, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_event_admins(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_event_schedule() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.event_start_moment(date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deliver_event_prize(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.evaluate_event_activation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_event_charges(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_event_users(uuid, text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_event_admins(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_event_schedule() TO service_role;
GRANT EXECUTE ON FUNCTION public.event_start_moment(date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deliver_event_prize(uuid) TO authenticated, service_role;

-- Acciones con verificación interna de rol o de propiedad
GRANT EXECUTE ON FUNCTION public.admin_create_event(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_event(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_event_room(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_start_event(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_event_sms(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finish_event(uuid, text, text, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_event_participant(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_event(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscribe_event(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_event_subscription(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enter_event_room(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.event_participant_counts() TO anon, authenticated, service_role;