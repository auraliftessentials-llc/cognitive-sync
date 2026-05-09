
-- 1. identity_links table
CREATE TABLE public.identity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_email text NOT NULL,
  linked_provider text NOT NULL DEFAULT 'email',
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_link CHECK (primary_user_id <> linked_user_id)
);

CREATE INDEX idx_identity_links_primary ON public.identity_links(primary_user_id);
CREATE INDEX idx_identity_links_linked ON public.identity_links(linked_user_id);

ALTER TABLE public.identity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view own links"
  ON public.identity_links FOR SELECT
  USING (auth.uid() = primary_user_id OR auth.uid() = linked_user_id OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Owner can create own links"
  ON public.identity_links FOR INSERT
  WITH CHECK (auth.uid() = primary_user_id);

CREATE POLICY "Owner can delete own links"
  ON public.identity_links FOR DELETE
  USING (auth.uid() = primary_user_id OR public.has_role(auth.uid(), 'super_admin'));

-- 2. resolve_operator_identity function
CREATE OR REPLACE FUNCTION public.resolve_operator_identity(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT primary_user_id FROM public.identity_links WHERE linked_user_id = _user_id LIMIT 1),
    _user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_operator_identity(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_operator_identity(uuid) TO authenticated;

-- 3. perf index on merkabah_commands
CREATE INDEX IF NOT EXISTS idx_merkabah_commands_user_created
  ON public.merkabah_commands(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merkabah_commands_idem
  ON public.merkabah_commands(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
