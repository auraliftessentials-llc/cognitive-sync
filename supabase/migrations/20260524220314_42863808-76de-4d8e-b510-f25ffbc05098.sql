
-- Phase 1: Project Library cockpit — additive columns on public.projects
-- Sacred Code: no removals, all new columns nullable or safely defaulted.

DO $$ BEGIN
  CREATE TYPE public.project_category AS ENUM (
    'master_os_omega',
    'grokify',
    'oralift',
    'agent_systems',
    'reference',
    'archive',
    'unclassified'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.project_revenue_status AS ENUM (
    'live',
    'ready_to_launch',
    'in_build',
    'idea',
    'paused'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS category public.project_category NOT NULL DEFAULT 'unclassified',
  ADD COLUMN IF NOT EXISTS revenue_status public.project_revenue_status NOT NULL DEFAULT 'idea',
  ADD COLUMN IF NOT EXISTS focus_priority integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS github_full_name text,
  ADD COLUMN IF NOT EXISTS github_private boolean,
  ADD COLUMN IF NOT EXISTS github_default_branch text,
  ADD COLUMN IF NOT EXISTS github_stars integer,
  ADD COLUMN IF NOT EXISTS github_open_issues integer,
  ADD COLUMN IF NOT EXISTS github_last_commit_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_projects_category ON public.projects(category);
CREATE INDEX IF NOT EXISTS idx_projects_revenue_status ON public.projects(revenue_status);
CREATE INDEX IF NOT EXISTS idx_projects_focus_priority ON public.projects(focus_priority DESC);
CREATE INDEX IF NOT EXISTS idx_projects_github_full_name ON public.projects(github_full_name);
