
ALTER TABLE public.roadmaps
  ADD COLUMN IF NOT EXISTS share_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS auto_revise boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_auto_revised_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_roadmaps_share_token ON public.roadmaps(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roadmaps_auto_revise ON public.roadmaps(auto_revise) WHERE auto_revise = true;

DROP POLICY IF EXISTS "public read shared roadmaps" ON public.roadmaps;
CREATE POLICY "public read shared roadmaps"
  ON public.roadmaps FOR SELECT
  TO anon, authenticated
  USING (share_token IS NOT NULL);

DROP POLICY IF EXISTS "public read progress for shared roadmaps" ON public.roadmap_progress;
CREATE POLICY "public read progress for shared roadmaps"
  ON public.roadmap_progress FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.roadmaps r
    WHERE r.id = roadmap_progress.roadmap_id AND r.share_token IS NOT NULL
  ));
