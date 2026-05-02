
CREATE TABLE public.user_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid,
  notice_key text NOT NULL,
  dismissed_at timestamptz,
  acknowledged_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, notice_key)
);

ALTER TABLE public.user_notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own notices" ON public.user_notices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "users insert own notices" ON public.user_notices
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users update own notices" ON public.user_notices
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER user_notices_updated_at
  BEFORE UPDATE ON public.user_notices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.key_rotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  rotated_at timestamptz NOT NULL DEFAULT now(),
  requires_republish boolean NOT NULL DEFAULT true,
  notes text,
  rotated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.key_rotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read rotations" ON public.key_rotations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "super_admin manage rotations" ON public.key_rotations
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX key_rotations_rotated_at_idx ON public.key_rotations (rotated_at DESC);

-- Seed the recent Supabase rotation so the banner appears immediately
INSERT INTO public.key_rotations (provider, requires_republish, notes)
VALUES ('supabase', true, 'Anon/publishable key rotated — re-publish required for live site.');
