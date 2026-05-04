-- User Vault: per-user encrypted secrets store
CREATE TABLE public.user_vault (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  key_name text NOT NULL,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  hint text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, key_name)
);

CREATE INDEX idx_user_vault_user ON public.user_vault(user_id);

ALTER TABLE public.user_vault ENABLE ROW LEVEL SECURITY;

-- Users can see their own keys exist, but ciphertext only ever leaves DB via server functions
CREATE POLICY "users view own vault metadata"
  ON public.user_vault FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users insert own vault"
  ON public.user_vault FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users update own vault"
  ON public.user_vault FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users delete own vault"
  ON public.user_vault FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "super_admin all vault"
  ON public.user_vault FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_user_vault_updated
  BEFORE UPDATE ON public.user_vault
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();