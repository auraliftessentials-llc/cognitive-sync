
-- Super-admin only: list all users with their auth metadata
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: super_admin role required';
  END IF;

  RETURN QUERY
    SELECT u.id, u.email::text, u.created_at, u.last_sign_in_at, u.email_confirmed_at
    FROM auth.users u
    ORDER BY u.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- Super-admin only: delete a user account entirely
CREATE OR REPLACE FUNCTION public.admin_delete_user(_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: super_admin role required';
  END IF;
  IF _target = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target;
  DELETE FROM public.profiles WHERE user_id = _target;
  DELETE FROM public.messages WHERE user_id = _target;
  DELETE FROM public.conversations WHERE user_id = _target;
  DELETE FROM public.suggestions WHERE user_id = _target;
  DELETE FROM public.projects WHERE user_id = _target;
  DELETE FROM auth.users WHERE id = _target;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

-- Allow super_admin / admin to read all data via RLS for the admin panel
-- Projects
DROP POLICY IF EXISTS "Admins view all projects" ON public.projects;
CREATE POLICY "Admins view all projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Profiles already viewable by all authenticated; nothing to add
-- Suggestions
DROP POLICY IF EXISTS "Admins view all suggestions" ON public.suggestions;
CREATE POLICY "Admins view all suggestions"
  ON public.suggestions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Conversations
DROP POLICY IF EXISTS "Admins view all conversations" ON public.conversations;
CREATE POLICY "Admins view all conversations"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Messages
DROP POLICY IF EXISTS "Admins view all messages" ON public.messages;
CREATE POLICY "Admins view all messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));
