-- LOCK 1: Stop auto-granting free trials on signup, grandfather existing 30 trials by 14 days.
-- Sacred Code: trigger function preserved (not dropped) for audit/restore; only the auth.users binding is removed.

-- 1. Remove the auto-trial-on-signup trigger. The function public.handle_new_user_subscription
--    is preserved unchanged for historical reference and potential restoration.
DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;

-- 2. Grandfather: extend any currently-trialing subscription by 14 days from now,
--    so existing users have time to add a card without losing access.
UPDATE public.subscriptions
   SET trial_ends_at = GREATEST(COALESCE(trial_ends_at, now()), now()) + interval '14 days',
       updated_at    = now()
 WHERE tier = 'free_trial'::public.plan_tier
   AND status = 'trialing';

-- 3. Audit log entry so the change is provable later.
INSERT INTO public.audit_log (workspace_id, actor_id, action, target_type, target_id, metadata)
SELECT NULL, NULL, 'monetization.lock1.applied', 'system', 'subscriptions',
       jsonb_build_object(
         'reason', 'Removed auto-trial trigger; grandfathered existing trials by 14 days.',
         'grandfathered_user_count', (SELECT COUNT(*) FROM public.subscriptions WHERE tier='free_trial' AND status='trialing'),
         'applied_at', now()
       )
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_log');
