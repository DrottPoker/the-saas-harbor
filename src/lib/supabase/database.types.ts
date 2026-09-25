export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "inbox"
            referencedColumns: ["other_id"]
          },
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "inbox"
            referencedColumns: ["other_id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_reads: {
        Row: {
          conversation_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          read_at: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "inbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "inbox"
            referencedColumns: ["other_id"]
          },
          {
            foreignKeyName: "conversation_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          started_by: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          started_by: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          started_by?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "inbox"
            referencedColumns: ["other_id"]
          },
          {
            foreignKeyName: "conversations_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "inbox"
            referencedColumns: ["other_id"]
          },
          {
            foreignKeyName: "conversations_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          kind: string
          message: string
          page: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          kind: string
          message: string
          page?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          kind?: string
          message?: string
          page?: string | null
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "inbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "inbox"
            referencedColumns: ["other_id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          id: string
          note: string
          reason: string | null
          report_id: string | null
          saas_id: string | null
          subject_id: string
          target_label: string
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          id?: string
          note?: string
          reason?: string | null
          report_id?: string | null
          saas_id?: string | null
          subject_id: string
          target_label: string
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          id?: string
          note?: string
          reason?: string | null
          report_id?: string | null
          saas_id?: string | null
          subject_id?: string
          target_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_log_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_log_saas_id_fkey"
            columns: ["saas_id"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_log_saas_id_fkey"
            columns: ["saas_id"]
            isOneToOne: false
            referencedRelation: "public_saas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_log_saas_id_fkey"
            columns: ["saas_id"]
            isOneToOne: false
            referencedRelation: "saas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_log_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "inbox"
            referencedColumns: ["other_id"]
          },
          {
            foreignKeyName: "moderation_log_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          messages: boolean
          reports: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          messages?: boolean
          reports?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          messages?: boolean
          reports?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_experience: {
        Row: {
          created_at: string
          description: string
          ends_on: string | null
          id: string
          organization: string
          profile_id: string
          starts_on: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string
          ends_on?: string | null
          id?: string
          organization: string
          profile_id: string
          starts_on: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          ends_on?: string | null
          id?: string
          organization?: string
          profile_id?: string
          starts_on?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_experience_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "inbox"
            referencedColumns: ["other_id"]
          },
          {
            foreignKeyName: "profile_experience_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          bio: string
          github_url: string
          headline: string
          id: string
          linkedin_url: string
          location: string
          name: string
          skills: string[]
          slug: string
          social_url: string
          suspended_at: string | null
          suspended_note: string
          suspended_reason: string | null
          updated_at: string
          website: string
          x_url: string
        }
        Insert: {
          avatar_path?: string | null
          bio?: string
          github_url?: string
          headline?: string
          id: string
          linkedin_url?: string
          location?: string
          name: string
          skills?: string[]
          slug: string
          social_url?: string
          suspended_at?: string | null
          suspended_note?: string
          suspended_reason?: string | null
          updated_at?: string
          website?: string
          x_url?: string
        }
        Update: {
          avatar_path?: string | null
          bio?: string
          github_url?: string
          headline?: string
          id?: string
          linkedin_url?: string
          location?: string
          name?: string
          skills?: string[]
          slug?: string
          social_url?: string
          suspended_at?: string | null
          suspended_note?: string
          suspended_reason?: string | null
          updated_at?: string
          website?: string
          x_url?: string
        }
        Relationships: []
      }
      public_metrics: {
        Row: {
          customers: number | null
          launched_on: string | null
          livemode: boolean | null
          mrr_cents: number | null
          mrr_growth_pct: number | null
          mrr_history: Json | null
          owner_id: string
          provider: string | null
          saas_id: string
          verified_at: string | null
        }
        Insert: {
          customers?: number | null
          launched_on?: string | null
          livemode?: boolean | null
          mrr_cents?: number | null
          mrr_growth_pct?: number | null
          mrr_history?: Json | null
          owner_id: string
          provider?: string | null
          saas_id: string
          verified_at?: string | null
        }
        Update: {
          customers?: number | null
          launched_on?: string | null
          livemode?: boolean | null
          mrr_cents?: number | null
          mrr_growth_pct?: number | null
          mrr_history?: Json | null
          owner_id?: string
          provider?: string | null
          saas_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_metrics_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "public_metrics_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "public_saas"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "public_metrics_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "saas"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      reports: {
        Row: {
          content: Json
          created_at: string
          details: string
          id: string
          message_id: string | null
          reason: string
          reporter_id: string
          resolved_at: string | null
          saas_id: string | null
          status: string
          subject_id: string
          target: string
        }
        Insert: {
          content: Json
          created_at?: string
          details?: string
          id?: string
          message_id?: string | null
          reason: string
          reporter_id: string
          resolved_at?: string | null
          saas_id?: string | null
          status?: string
          subject_id: string
          target: string
        }
        Update: {
          content?: Json
          created_at?: string
          details?: string
          id?: string
          message_id?: string | null
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          saas_id?: string | null
          status?: string
          subject_id?: string
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_saas_id_fkey"
            columns: ["saas_id"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_saas_id_fkey"
            columns: ["saas_id"]
            isOneToOne: false
            referencedRelation: "public_saas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_saas_id_fkey"
            columns: ["saas_id"]
            isOneToOne: false
            referencedRelation: "saas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "inbox"
            referencedColumns: ["other_id"]
          },
          {
            foreignKeyName: "reports_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_connections: {
        Row: {
          connected_at: string
          encrypted_key: string
          key_hint: string
          last_checked_at: string | null
          last_error: string | null
          last_synced_at: string | null
          livemode: boolean
          owner_id: string
          provider: string
          saas_id: string
          status: string
        }
        Insert: {
          connected_at?: string
          encrypted_key: string
          key_hint: string
          last_checked_at?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          livemode: boolean
          owner_id: string
          provider: string
          saas_id: string
          status?: string
        }
        Update: {
          connected_at?: string
          encrypted_key?: string
          key_hint?: string
          last_checked_at?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          livemode?: boolean
          owner_id?: string
          provider?: string
          saas_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_connections_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "revenue_connections_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "public_saas"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "revenue_connections_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "saas"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      revenue_snapshots: {
        Row: {
          captured_at: string
          currencies: Json
          customers: number
          fx_date: string | null
          history: Json | null
          history_at: string | null
          id: string
          livemode: boolean
          mrr_30d_ago_cents: number | null
          mrr_cents: number
          mrr_invoice_cents: number | null
          owner_id: string
          provider: string
          saas_id: string
          seq: number
        }
        Insert: {
          captured_at?: string
          currencies?: Json
          customers: number
          fx_date?: string | null
          history?: Json | null
          history_at?: string | null
          id?: string
          livemode: boolean
          mrr_30d_ago_cents?: number | null
          mrr_cents: number
          mrr_invoice_cents?: number | null
          owner_id: string
          provider: string
          saas_id: string
          seq?: never
        }
        Update: {
          captured_at?: string
          currencies?: Json
          customers?: number
          fx_date?: string | null
          history?: Json | null
          history_at?: string | null
          id?: string
          livemode?: boolean
          mrr_30d_ago_cents?: number | null
          mrr_cents?: number
          mrr_invoice_cents?: number | null
          owner_id?: string
          provider?: string
          saas_id?: string
          seq?: never
        }
        Relationships: [
          {
            foreignKeyName: "revenue_snapshots_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "revenue_snapshots_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "public_saas"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "revenue_snapshots_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "saas"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      saas: {
        Row: {
          category: string
          created_at: string
          description: string
          hidden_at: string | null
          hidden_note: string
          hidden_reason: string | null
          id: string
          logo_path: string | null
          name: string
          owner_id: string
          slug: string
          tagline: string
          updated_at: string
          website: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          hidden_at?: string | null
          hidden_note?: string
          hidden_reason?: string | null
          id?: string
          logo_path?: string | null
          name: string
          owner_id: string
          slug: string
          tagline: string
          updated_at?: string
          website: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          hidden_at?: string | null
          hidden_note?: string
          hidden_reason?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          owner_id?: string
          slug?: string
          tagline?: string
          updated_at?: string
          website?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "inbox"
            referencedColumns: ["other_id"]
          },
          {
            foreignKeyName: "saas_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_settings: {
        Row: {
          launched_on: string | null
          owner_id: string
          saas_id: string
          share_customers: boolean
          share_launch: boolean
          share_mrr: boolean
          updated_at: string
        }
        Insert: {
          launched_on?: string | null
          owner_id: string
          saas_id: string
          share_customers?: boolean
          share_launch?: boolean
          share_mrr?: boolean
          updated_at?: string
        }
        Update: {
          launched_on?: string | null
          owner_id?: string
          saas_id?: string
          share_customers?: boolean
          share_launch?: boolean
          share_mrr?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_settings_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "saas_settings_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "public_saas"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "saas_settings_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "saas"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
    }
    Views: {
      category_counts: {
        Row: {
          category: string | null
          products: number | null
          ranked: number | null
        }
        Relationships: []
      }
      inbox: {
        Row: {
          blocked: boolean | null
          id: string | null
          last_body: string | null
          last_message_at: string | null
          last_sender_id: string | null
          other_avatar_path: string | null
          other_id: string | null
          other_name: string | null
          unread: number | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["last_sender_id"]
            isOneToOne: false
            referencedRelation: "inbox"
            referencedColumns: ["other_id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["last_sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard: {
        Row: {
          category: string | null
          created_at: string | null
          customers: number | null
          description: string | null
          id: string | null
          launched_on: string | null
          livemode: boolean | null
          logo_path: string | null
          mrr_cents: number | null
          mrr_growth_pct: number | null
          mrr_history: Json | null
          name: string | null
          owner_avatar_path: string | null
          owner_id: string | null
          owner_name: string | null
          owner_slug: string | null
          provider: string | null
          rank: number | null
          revenue_status: string | null
          slug: string | null
          tagline: string | null
          updated_at: string | null
          verified_at: string | null
          website: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saas_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "inbox"
            referencedColumns: ["other_id"]
          },
          {
            foreignKeyName: "saas_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_saas: {
        Row: {
          category: string | null
          created_at: string | null
          customers: number | null
          description: string | null
          id: string | null
          launched_on: string | null
          livemode: boolean | null
          logo_path: string | null
          mrr_cents: number | null
          mrr_growth_pct: number | null
          mrr_history: Json | null
          name: string | null
          owner_avatar_path: string | null
          owner_id: string | null
          owner_name: string | null
          owner_slug: string | null
          provider: string | null
          revenue_status: string | null
          slug: string | null
          tagline: string | null
          updated_at: string | null
          verified_at: string | null
          website: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saas_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "inbox"
            referencedColumns: ["other_id"]
          },
          {
            foreignKeyName: "saas_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_account: {
        Args: { p_id: string }
        Returns: {
          created_at: string
          email: string
          email_confirmed_at: string
          id: string
          is_admin: boolean
          last_sign_in_at: string
        }[]
      }
      admin_accounts: {
        Args: { p_filter: string; p_search: string }
        Returns: {
          avatar_path: string
          created_at: string
          email: string
          headline: string
          id: string
          is_admin: boolean
          last_sign_in_at: string
          name: string
          open_reports: number
          products: number
          suspended_at: string
        }[]
      }
      admin_dismiss_report: {
        Args: { p_note: string; p_report: string }
        Returns: undefined
      }
      admin_hide_saas: {
        Args: {
          p_note: string
          p_reason: string
          p_report: string
          p_saas: string
        }
        Returns: undefined
      }
      admin_restore_account: {
        Args: { p_note: string; p_profile: string }
        Returns: undefined
      }
      admin_restore_saas: {
        Args: { p_note: string; p_saas: string }
        Returns: undefined
      }
      admin_set_feedback_handled: {
        Args: { p_feedback: string; p_handled: boolean }
        Returns: undefined
      }
      admin_suspend_account: {
        Args: {
          p_note: string
          p_profile: string
          p_reason: string
          p_report: string
        }
        Returns: undefined
      }
      begin_revenue_check: {
        Args: { p_refresh: boolean; p_saas: string }
        Returns: undefined
      }
      check_username: { Args: { p_username: string }; Returns: string }
      claim_due_connections: {
        Args: { p_interval: string; p_limit: number }
        Returns: string[]
      }
      claim_emails: {
        Args: { p_limit: number; p_message_delay: number }
        Returns: {
          context: Json
          email: string
          id: number
          kind: string
          name: string
        }[]
      }
      complete_email: {
        Args: { p_error: string; p_id: number; p_status: string }
        Returns: undefined
      }
      delete_account: { Args: never; Returns: undefined }
      directory_stats: { Args: never; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      list_admins: {
        Args: never
        Returns: {
          created_at: string
          email: string
        }[]
      }
      mark_conversation_read: {
        Args: { p_conversation: string; p_read_at: string }
        Returns: undefined
      }
      record_revenue_verification: {
        Args: {
          p_currencies: Json
          p_customers: number
          p_encrypted_key: string
          p_fx_date: string
          p_history: Json
          p_history_at?: string
          p_key_hint: string
          p_livemode: boolean
          p_mrr_30d_ago_cents: number
          p_mrr_cents: number
          p_mrr_invoice_cents: number
          p_provider: string
          p_saas_id: string
          p_subscription_hashes: string[]
        }
        Returns: undefined
      }
      saas_slug_redirect: { Args: { p_slug: string }; Returns: string }
      save_notification_settings: {
        Args: { p_messages: boolean; p_reports: boolean }
        Returns: undefined
      }
      save_profile: {
        Args: {
          p_avatar_path: string
          p_bio: string
          p_experience: Json
          p_github_url: string
          p_headline: string
          p_linkedin_url: string
          p_location: string
          p_name: string
          p_skills: string[]
          p_social_url: string
          p_website: string
          p_x_url: string
        }
        Returns: undefined
      }
      save_saas: {
        Args: {
          p_category: string
          p_description: string
          p_id: string
          p_launched_on: string
          p_logo_path: string
          p_name: string
          p_share_customers: boolean
          p_share_launch: boolean
          p_share_mrr: boolean
          p_tagline: string
          p_website: string
        }
        Returns: string
      }
      send_message: {
        Args: { p_body: string; p_recipient: string }
        Returns: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_admin: {
        Args: { p_admin: boolean; p_email: string }
        Returns: string
      }
      set_username: { Args: { p_username: string }; Returns: undefined }
      submit_feedback: {
        Args: { p_kind: string; p_message: string; p_page: string }
        Returns: string
      }
      submit_report: {
        Args: {
          p_details: string
          p_id: string
          p_reason: string
          p_target: string
        }
        Returns: string
      }
      unread_message_count: { Args: never; Returns: number }
      username_change_available_at: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

