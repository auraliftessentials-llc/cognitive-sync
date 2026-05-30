export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_runs: {
        Row: {
          agent_id: string
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          model: string
          output: string | null
          prompt: string
          status: string
          tokens_in: number | null
          tokens_out: number | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          model: string
          output?: string | null
          prompt: string
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          model?: string
          output?: string | null
          prompt?: string
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tool_calls: {
        Row: {
          arguments: Json
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          result: Json | null
          run_id: string | null
          status: string
          tool_name: string
          user_id: string
        }
        Insert: {
          arguments?: Json
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          result?: Json | null
          run_id?: string | null
          status?: string
          tool_name: string
          user_id: string
        }
        Update: {
          arguments?: Json
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          result?: Json | null
          run_id?: string | null
          status?: string
          tool_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tool_calls_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          available_models: string[]
          created_at: string
          default_model: string
          emoji: string
          id: string
          is_system: boolean
          name: string
          reasoning_effort: string
          role: string
          slug: string
          system_prompt: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          available_models?: string[]
          created_at?: string
          default_model?: string
          emoji?: string
          id?: string
          is_system?: boolean
          name: string
          reasoning_effort?: string
          role: string
          slug: string
          system_prompt: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          available_models?: string[]
          created_at?: string
          default_model?: string
          emoji?: string
          id?: string
          is_system?: boolean
          name?: string
          reasoning_effort?: string
          role?: string
          slug?: string
          system_prompt?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          id: string
          ip: string | null
          metadata: Json
          target_id: string | null
          target_type: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_health: {
        Row: {
          checked_at: string
          http: number | null
          id: string
          latency_ms: number | null
          message: string | null
          provider: string
          status: string
        }
        Insert: {
          checked_at?: string
          http?: number | null
          id?: string
          latency_ms?: number | null
          message?: string | null
          provider: string
          status: string
        }
        Update: {
          checked_at?: string
          http?: number | null
          id?: string
          latency_ms?: number | null
          message?: string | null
          provider?: string
          status?: string
        }
        Relationships: []
      }
      bridge_audit: {
        Row: {
          action: string
          bytes: number | null
          created_at: string
          device_id: string | null
          duration_ms: number | null
          error: string | null
          id: string
          ip: string | null
          ok: boolean
          target: string | null
          user_id: string
        }
        Insert: {
          action: string
          bytes?: number | null
          created_at?: string
          device_id?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          ip?: string | null
          ok?: boolean
          target?: string | null
          user_id: string
        }
        Update: {
          action?: string
          bytes?: number | null
          created_at?: string
          device_id?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          ip?: string | null
          ok?: boolean
          target?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bridge_audit_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "bridge_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      bridge_devices: {
        Row: {
          allowed_roots: string[]
          api_key_hash: string | null
          api_key_prefix: string | null
          capabilities: string[]
          created_at: string
          hostname: string | null
          id: string
          last_seen_at: string | null
          name: string
          paired_at: string | null
          pairing_code: string | null
          pairing_expires_at: string | null
          platform: string
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_roots?: string[]
          api_key_hash?: string | null
          api_key_prefix?: string | null
          capabilities?: string[]
          created_at?: string
          hostname?: string | null
          id?: string
          last_seen_at?: string | null
          name: string
          paired_at?: string | null
          pairing_code?: string | null
          pairing_expires_at?: string | null
          platform?: string
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_roots?: string[]
          api_key_hash?: string | null
          api_key_prefix?: string | null
          capabilities?: string[]
          created_at?: string
          hostname?: string | null
          id?: string
          last_seen_at?: string | null
          name?: string
          paired_at?: string | null
          pairing_code?: string | null
          pairing_expires_at?: string | null
          platform?: string
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cli_schedule_runs: {
        Row: {
          attempt: number
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          model: string | null
          output: string | null
          provider: string | null
          schedule_id: string
          started_at: string
          status: string
          trigger: string
          user_id: string
        }
        Insert: {
          attempt?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          model?: string | null
          output?: string | null
          provider?: string | null
          schedule_id: string
          started_at?: string
          status?: string
          trigger?: string
          user_id: string
        }
        Update: {
          attempt?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          model?: string | null
          output?: string | null
          provider?: string | null
          schedule_id?: string
          started_at?: string
          status?: string
          trigger?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cli_schedule_runs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "cli_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      cli_schedules: {
        Row: {
          agent_slug: string
          consecutive_failures: number
          created_at: string
          cron: string
          enabled: boolean
          id: string
          last_error_emailed_at: string | null
          last_output: string | null
          last_run_at: string | null
          last_status: string | null
          lock_until: string | null
          model: string | null
          name: string
          notify_email: string | null
          prompt: string
          total_failures: number
          total_runs: number
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_slug?: string
          consecutive_failures?: number
          created_at?: string
          cron: string
          enabled?: boolean
          id?: string
          last_error_emailed_at?: string | null
          last_output?: string | null
          last_run_at?: string | null
          last_status?: string | null
          lock_until?: string | null
          model?: string | null
          name: string
          notify_email?: string | null
          prompt: string
          total_failures?: number
          total_runs?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_slug?: string
          consecutive_failures?: number
          created_at?: string
          cron?: string
          enabled?: boolean
          id?: string
          last_error_emailed_at?: string | null
          last_output?: string | null
          last_run_at?: string | null
          last_status?: string | null
          lock_until?: string | null
          model?: string | null
          name?: string
          notify_email?: string | null
          prompt?: string
          total_failures?: number
          total_runs?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cli_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash?: string
          token_prefix?: string
          user_id?: string
        }
        Relationships: []
      }
      command_webhook_deliveries: {
        Row: {
          attempt: number
          command_id: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          event: string
          http_status: number | null
          id: string
          payload: Json
          response_body: string | null
          status: string
          user_id: string
          webhook_id: string
        }
        Insert: {
          attempt?: number
          command_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          event: string
          http_status?: number | null
          id?: string
          payload?: Json
          response_body?: string | null
          status?: string
          user_id: string
          webhook_id: string
        }
        Update: {
          attempt?: number
          command_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          event?: string
          http_status?: number | null
          id?: string
          payload?: Json
          response_body?: string | null
          status?: string
          user_id?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "command_webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "command_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      command_webhooks: {
        Row: {
          created_at: string
          enabled: boolean
          events: string[]
          id: string
          last_delivery_at: string | null
          last_status: string | null
          name: string
          secret: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          events?: string[]
          id?: string
          last_delivery_at?: string | null
          last_status?: string | null
          name: string
          secret: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          events?: string[]
          id?: string
          last_delivery_at?: string | null
          last_status?: string | null
          name?: string
          secret?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_milestones: {
        Row: {
          commit_sha: string | null
          created_at: string
          created_by: string | null
          description: string | null
          fingerprint: string | null
          id: string
          occurred_at: string
          title: string
        }
        Insert: {
          commit_sha?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          fingerprint?: string | null
          id?: string
          occurred_at?: string
          title: string
        }
        Update: {
          commit_sha?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          fingerprint?: string | null
          id?: string
          occurred_at?: string
          title?: string
        }
        Relationships: []
      }
      cron_heartbeat: {
        Row: {
          due_count: number
          duration_ms: number | null
          error_count: number
          id: string
          job: string
          notes: string | null
          ran_count: number
          ticked_at: string
        }
        Insert: {
          due_count?: number
          duration_ms?: number | null
          error_count?: number
          id?: string
          job: string
          notes?: string | null
          ran_count?: number
          ticked_at?: string
        }
        Update: {
          due_count?: number
          duration_ms?: number | null
          error_count?: number
          id?: string
          job?: string
          notes?: string | null
          ran_count?: number
          ticked_at?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          id: string
          key: string
          updated_at: string
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          updated_at?: string
        }
        Update: {
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      frontier_intel: {
        Row: {
          category: string
          discovered_at: string
          id: string
          impact_score: number
          raw: Json
          source: string
          summary: string
          tags: string[]
          title: string
          url: string | null
        }
        Insert: {
          category: string
          discovered_at?: string
          id?: string
          impact_score?: number
          raw?: Json
          source: string
          summary: string
          tags?: string[]
          title: string
          url?: string | null
        }
        Update: {
          category?: string
          discovered_at?: string
          id?: string
          impact_score?: number
          raw?: Json
          source?: string
          summary?: string
          tags?: string[]
          title?: string
          url?: string | null
        }
        Relationships: []
      }
      identity_links: {
        Row: {
          created_at: string
          id: string
          linked_email: string
          linked_provider: string
          linked_user_id: string
          primary_user_id: string
          verified_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          linked_email: string
          linked_provider?: string
          linked_user_id: string
          primary_user_id: string
          verified_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          linked_email?: string
          linked_provider?: string
          linked_user_id?: string
          primary_user_id?: string
          verified_at?: string
        }
        Relationships: []
      }
      infra_resources: {
        Row: {
          created_at: string
          endpoint: string | null
          id: string
          kind: string
          last_checked_at: string | null
          metadata: Json
          metrics: Json
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint?: string | null
          id?: string
          kind: string
          last_checked_at?: string | null
          metadata?: Json
          metrics?: Json
          name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string | null
          id?: string
          kind?: string
          last_checked_at?: string | null
          metadata?: Json
          metrics?: Json
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      key_rotations: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          provider: string
          requires_republish: boolean
          rotated_at: string
          rotated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          provider: string
          requires_republish?: boolean
          rotated_at?: string
          rotated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          provider?: string
          requires_republish?: boolean
          rotated_at?: string
          rotated_by?: string | null
        }
        Relationships: []
      }
      merkabah_commands: {
        Row: {
          command: string
          created_at: string
          error: string | null
          id: string
          idempotency_key: string | null
          latency_ms: number | null
          metadata: Json
          result: Json | null
          source: string
          status: string
          updated_at: string
          user_id: string
          winner: string | null
        }
        Insert: {
          command: string
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          latency_ms?: number | null
          metadata?: Json
          result?: Json | null
          source?: string
          status?: string
          updated_at?: string
          user_id: string
          winner?: string | null
        }
        Update: {
          command?: string
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          latency_ms?: number | null
          metadata?: Json
          result?: Json | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
          winner?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          focus_areas: string[] | null
          id: string
          skills: string[] | null
          thinking_style: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          focus_areas?: string[] | null
          id?: string
          skills?: string[] | null
          thinking_style?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          focus_areas?: string[] | null
          id?: string
          skills?: string[] | null
          thinking_style?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          category: Database["public"]["Enums"]["project_category"]
          created_at: string
          description: string | null
          focus_priority: number
          github_default_branch: string | null
          github_full_name: string | null
          github_last_commit_at: string | null
          github_open_issues: number | null
          github_private: boolean | null
          github_stars: number | null
          id: string
          last_synced_at: string | null
          last_worked_on: string | null
          live_url: string | null
          name: string
          next_action: string | null
          notes: string | null
          priority: number
          repo_url: string | null
          revenue_status: Database["public"]["Enums"]["project_revenue_status"]
          status: string
          tags: string[] | null
          tech_stack: string[] | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["project_category"]
          created_at?: string
          description?: string | null
          focus_priority?: number
          github_default_branch?: string | null
          github_full_name?: string | null
          github_last_commit_at?: string | null
          github_open_issues?: number | null
          github_private?: boolean | null
          github_stars?: number | null
          id?: string
          last_synced_at?: string | null
          last_worked_on?: string | null
          live_url?: string | null
          name: string
          next_action?: string | null
          notes?: string | null
          priority?: number
          repo_url?: string | null
          revenue_status?: Database["public"]["Enums"]["project_revenue_status"]
          status?: string
          tags?: string[] | null
          tech_stack?: string[] | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["project_category"]
          created_at?: string
          description?: string | null
          focus_priority?: number
          github_default_branch?: string | null
          github_full_name?: string | null
          github_last_commit_at?: string | null
          github_open_issues?: number | null
          github_private?: boolean | null
          github_stars?: number | null
          id?: string
          last_synced_at?: string | null
          last_worked_on?: string | null
          live_url?: string | null
          name?: string
          next_action?: string | null
          notes?: string | null
          priority?: number
          repo_url?: string | null
          revenue_status?: Database["public"]["Enums"]["project_revenue_status"]
          status?: string
          tags?: string[] | null
          tech_stack?: string[] | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      provenance_events: {
        Row: {
          actor: string | null
          created_at: string
          event: string
          id: string
          ip: string | null
          metadata: Json
          target: string | null
          user_agent: string | null
        }
        Insert: {
          actor?: string | null
          created_at?: string
          event: string
          id?: string
          ip?: string | null
          metadata?: Json
          target?: string | null
          user_agent?: string | null
        }
        Update: {
          actor?: string | null
          created_at?: string
          event?: string
          id?: string
          ip?: string | null
          metadata?: Json
          target?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      roadmap_progress: {
        Row: {
          created_at: string
          id: string
          mastery_level: number
          notes: string | null
          roadmap_id: string
          status: string
          time_spent_minutes: number
          topic_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mastery_level?: number
          notes?: string | null
          roadmap_id: string
          status?: string
          time_spent_minutes?: number
          topic_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mastery_level?: number
          notes?: string | null
          roadmap_id?: string
          status?: string
          time_spent_minutes?: number
          topic_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_progress_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "roadmaps"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmaps: {
        Row: {
          auto_revise: boolean
          created_at: string
          data: Json
          duration_weeks: number
          goal: string | null
          id: string
          last_auto_revised_at: string | null
          merkaba_level: string
          share_token: string | null
          title: string
          updated_at: string
          user_id: string
          weekly_hours: number
          workspace_id: string | null
        }
        Insert: {
          auto_revise?: boolean
          created_at?: string
          data?: Json
          duration_weeks?: number
          goal?: string | null
          id?: string
          last_auto_revised_at?: string | null
          merkaba_level?: string
          share_token?: string | null
          title: string
          updated_at?: string
          user_id: string
          weekly_hours?: number
          workspace_id?: string | null
        }
        Update: {
          auto_revise?: boolean
          created_at?: string
          data?: Json
          duration_weeks?: number
          goal?: string | null
          id?: string
          last_auto_revised_at?: string | null
          merkaba_level?: string
          share_token?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          weekly_hours?: number
          workspace_id?: string | null
        }
        Relationships: []
      }
      skill_assessments: {
        Row: {
          answers: Json
          created_at: string
          id: string
          overall_level: string | null
          result: Json
          user_id: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          id?: string
          overall_level?: string | null
          result?: Json
          user_id: string
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          overall_level?: string | null
          result?: Json
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          payment_method_attached: boolean
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: Database["public"]["Enums"]["plan_tier"]
          trial_ends_at: string
          trial_started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          payment_method_attached?: boolean
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["plan_tier"]
          trial_ends_at?: string
          trial_started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          payment_method_attached?: boolean
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["plan_tier"]
          trial_ends_at?: string
          trial_started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suggestions: {
        Row: {
          body: string
          created_at: string
          dismissed: boolean
          id: string
          kind: string
          related_project_ids: string[] | null
          title: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          dismissed?: boolean
          id?: string
          kind?: string
          related_project_ids?: string[] | null
          title: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          dismissed?: boolean
          id?: string
          kind?: string
          related_project_ids?: string[] | null
          title?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          cost_usd: number | null
          created_at: string
          id: string
          latency_ms: number | null
          model: string
          provider: string
          task_kind: string | null
          tokens_in: number | null
          tokens_out: number | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          model: string
          provider: string
          task_kind?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          model?: string
          provider?: string
          task_kind?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      user_feature_overrides: {
        Row: {
          enabled: boolean
          id: string
          key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          enabled: boolean
          id?: string
          key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          id?: string
          key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_notices: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          dismissed_at: string | null
          id: string
          metadata: Json
          notice_key: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          metadata?: Json
          notice_key: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          metadata?: Json
          notice_key?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_vault: {
        Row: {
          auth_tag: string
          ciphertext: string
          created_at: string
          hint: string | null
          id: string
          iv: string
          key_name: string
          last_used_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_tag: string
          ciphertext: string
          created_at?: string
          hint?: string | null
          id?: string
          iv: string
          key_name: string
          last_used_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_tag?: string
          ciphertext?: string
          created_at?: string
          hint?: string | null
          id?: string
          iv?: string
          key_name?: string
          last_used_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workspace_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["workspace_role"]
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["workspace_role"]
          token?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      zoho_connections: {
        Row: {
          access_token: string
          accounts_domain: string
          api_domain: string
          created_at: string
          email: string
          expires_at: string
          id: string
          refresh_token: string
          scopes: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          accounts_domain?: string
          api_domain?: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          refresh_token: string
          scopes?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          accounts_domain?: string
          api_domain?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          scopes?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_workspace_invite: { Args: { _token: string }; Returns: string }
      admin_delete_user: { Args: { _target: string }; Returns: undefined }
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          email_confirmed_at: string
          id: string
          last_sign_in_at: string
        }[]
      }
      claim_bridge_pairing: {
        Args: {
          _code: string
          _hash: string
          _hostname: string
          _prefix: string
        }
        Returns: string
      }
      claim_schedule: {
        Args: { _id: string; _lock_seconds?: number }
        Returns: boolean
      }
      find_bridge_device: {
        Args: { _hash: string }
        Returns: {
          allowed_roots: string[]
          capabilities: string[]
          device_id: string
          user_id: string
        }[]
      }
      find_cli_token_user: {
        Args: { _hash: string }
        Returns: {
          scopes: string[]
          token_id: string
          user_id: string
        }[]
      }
      get_operator_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_active_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_workspace_role: {
        Args: {
          _roles: Database["public"]["Enums"]["workspace_role"][]
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      is_quiet_mode: { Args: never; Returns: boolean }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      release_schedule: { Args: { _id: string }; Returns: undefined }
      resolve_operator_identity: { Args: { _user_id: string }; Returns: string }
      workspace_role_of: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "user"
      plan_tier:
        | "free_trial"
        | "operator"
        | "architect"
        | "sovereign"
        | "lifetime"
      project_category:
        | "master_os_omega"
        | "grokify"
        | "oralift"
        | "agent_systems"
        | "reference"
        | "archive"
        | "unclassified"
      project_revenue_status:
        | "live"
        | "ready_to_launch"
        | "in_build"
        | "idea"
        | "paused"
      workspace_role: "owner" | "admin" | "manager" | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "user"],
      plan_tier: [
        "free_trial",
        "operator",
        "architect",
        "sovereign",
        "lifetime",
      ],
      project_category: [
        "master_os_omega",
        "grokify",
        "oralift",
        "agent_systems",
        "reference",
        "archive",
        "unclassified",
      ],
      project_revenue_status: [
        "live",
        "ready_to_launch",
        "in_build",
        "idea",
        "paused",
      ],
      workspace_role: ["owner", "admin", "manager", "member"],
    },
  },
} as const
