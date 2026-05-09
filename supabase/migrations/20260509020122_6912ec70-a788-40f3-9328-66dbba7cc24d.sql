
-- =====================================================================
-- ABSOLUTE AUTHORITY LOCKDOWN — single super_admin (ryanauralift@gmail.com)
-- =====================================================================

-- 1. Link all known operator emails to the primary identity
INSERT INTO public.identity_links (primary_user_id, linked_user_id, linked_email, linked_provider)
SELECT
  'a8db5949-82a6-4ec3-a917-81aaf147250b'::uuid,
  u.id,
  u.email,
  COALESCE((u.raw_app_meta_data->>'provider'), 'email')
FROM auth.users u
WHERE u.id IN (
  'b76a2faf-1da2-4e07-954c-30b658ca4029'::uuid,
  'b9ee6e39-8228-4d60-a243-e2ef97f7a640'::uuid,
  '8d461efb-65e0-4f56-9558-2a4ebfa1b51f'::uuid
)
ON CONFLICT (linked_user_id) DO NOTHING;

-- 2. Throne lock: only the existing super_admin can grant/revoke super_admin.
--    Database-enforced — no app code can bypass this, even with service role
--    misuse from a compromised edge function (because it runs at row level).
CREATE OR REPLACE FUNCTION public.guard_super_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  caller_is_super boolean;
  super_count int;
BEGIN
  -- Only guard super_admin grants/revokes
  IF (TG_OP = 'INSERT' AND NEW.role = 'super_admin'::app_role)
     OR (TG_OP = 'DELETE' AND OLD.role = 'super_admin'::app_role)
     OR (TG_OP = 'UPDATE' AND (NEW.role = 'super_admin'::app_role OR OLD.role = 'super_admin'::app_role))
  THEN
    -- Allow service-role / system bootstrap (no JWT context = trusted backend op)
    IF caller IS NULL THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    -- Caller must already be super_admin (no self-elevation)
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = caller AND role = 'super_admin'::app_role
    ) INTO caller_is_super;

    IF NOT caller_is_super THEN
      RAISE EXCEPTION 'Forbidden: only an existing super_admin may grant or revoke super_admin role';
    END IF;

    -- Prevent removing the LAST super_admin (no orphaned throne)
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.role = 'super_admin' AND NEW.role <> 'super_admin') THEN
      SELECT COUNT(*) INTO super_count FROM public.user_roles WHERE role = 'super_admin'::app_role;
      IF super_count <= 1 THEN
        RAISE EXCEPTION 'Forbidden: cannot remove the last super_admin (throne would be vacant)';
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS guard_super_admin_role_trg ON public.user_roles;
CREATE TRIGGER guard_super_admin_role_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_super_admin_role();

-- 3. Ensure exactly one super_admin row exists for the primary identity
INSERT INTO public.user_roles (user_id, role)
VALUES ('a8db5949-82a6-4ec3-a917-81aaf147250b'::uuid, 'super_admin'::app_role)
ON CONFLICT DO NOTHING;
