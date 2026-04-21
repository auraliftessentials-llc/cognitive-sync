-- CLI access tokens for the `neural` command-line tool
CREATE TABLE public.cli_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cli_tokens_user ON public.cli_tokens(user_id);
CREATE INDEX idx_cli_tokens_hash ON public.cli_tokens(token_hash) WHERE revoked_at IS NULL;

ALTER TABLE public.cli_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own cli tokens"
ON public.cli_tokens FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "super_admin all cli tokens"
ON public.cli_tokens FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Resolve a presented token hash to a user + scopes, updating last_used_at.
-- SECURITY DEFINER so it can be called from a service-role server route
-- without exposing the table to unauthenticated clients.
CREATE OR REPLACE FUNCTION public.find_cli_token_user(_hash text)
RETURNS TABLE(user_id uuid, scopes text[], token_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  SELECT t.id, t.user_id, t.scopes
    INTO rec
    FROM public.cli_tokens t
   WHERE t.token_hash = _hash
     AND t.revoked_at IS NULL
     AND (t.expires_at IS NULL OR t.expires_at > now())
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.cli_tokens SET last_used_at = now() WHERE id = rec.id;
  user_id := rec.user_id;
  scopes := rec.scopes;
  token_id := rec.id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.find_cli_token_user(text) FROM public;
GRANT EXECUTE ON FUNCTION public.find_cli_token_user(text) TO service_role;