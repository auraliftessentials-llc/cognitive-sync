CREATE OR REPLACE FUNCTION public.get_operator_roles(_user_id uuid)
RETURNS SETOF public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ur.role
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
     OR ur.user_id = public.resolve_operator_identity(_user_id);
$$;

REVOKE ALL ON FUNCTION public.get_operator_roles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_operator_roles(uuid) TO authenticated;