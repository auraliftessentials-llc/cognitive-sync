-- Authorship & creator protection — Part 1 of the approved plan.
-- Sacred Code rule: additive only. No existing tables/policies are modified.

CREATE TABLE IF NOT EXISTS public.creator_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  commit_sha text,
  fingerprint text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.creator_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone authenticated reads milestones"
  ON public.creator_milestones FOR SELECT TO authenticated USING (true);

CREATE POLICY "super_admin writes milestones"
  ON public.creator_milestones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.creator_milestones;

CREATE TABLE IF NOT EXISTS public.provenance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  actor uuid,
  ip text,
  user_agent text,
  target text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provenance_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin reads provenance"
  ON public.provenance_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "authenticated insert own provenance"
  ON public.provenance_events FOR INSERT TO authenticated
  WITH CHECK (actor IS NULL OR actor = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS provenance_events_created_at_idx
  ON public.provenance_events (created_at DESC);

INSERT INTO public.creator_milestones (title, description, occurred_at)
VALUES (
  'Authorship & Creator Protection embedded',
  'Added CREATOR.md, NOTICE, docs/DOCTRINE.md, docs/MILESTONES.md, src/lib/creator.ts, src/lib/creator.server.ts, public /api/public/health endpoint, HTML head watermarks (meta author/creator/publisher/copyright + JSON-LD Person/Organization/SoftwareApplication schema + data-creator attribute on html), and creator fingerprint stamped into every merkabah_commands row metadata. Created creator_milestones and provenance_events tables.',
  now()
);