
CREATE TABLE public.roadmaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid,
  title text NOT NULL,
  goal text,
  duration_weeks integer NOT NULL DEFAULT 12,
  weekly_hours integer NOT NULL DEFAULT 12,
  merkaba_level text NOT NULL DEFAULT 'Initiate',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.roadmaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own roadmaps" ON public.roadmaps FOR ALL TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(),'super_admin'::app_role));
CREATE TRIGGER roadmaps_updated_at BEFORE UPDATE ON public.roadmaps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.roadmap_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id uuid NOT NULL REFERENCES public.roadmaps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  topic_name text NOT NULL,
  status text NOT NULL DEFAULT 'learning',
  mastery_level integer NOT NULL DEFAULT 50,
  time_spent_minutes integer NOT NULL DEFAULT 0,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (roadmap_id, topic_name)
);
ALTER TABLE public.roadmap_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own progress" ON public.roadmap_progress FOR ALL TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(),'super_admin'::app_role));
CREATE TRIGGER roadmap_progress_updated_at BEFORE UPDATE ON public.roadmap_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.skill_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  overall_level text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.skill_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own assessments" ON public.skill_assessments FOR ALL TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(),'super_admin'::app_role));
