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
      profiles: {
        Row: {
          avatar_path: string | null
          bio: string
          id: string
          name: string
          social_url: string
          updated_at: string
          website: string
        }
        Insert: {
          avatar_path?: string | null
          bio?: string
          id: string
          name: string
          social_url?: string
          updated_at?: string
          website?: string
        }
        Update: {
          avatar_path?: string | null
          bio?: string
          id?: string
          name?: string
          social_url?: string
          updated_at?: string
          website?: string
        }
        Relationships: []
      }
      public_metrics: {
        Row: {
          customers: number | null
          launched_on: string | null
          livemode: boolean | null
          mrr_cents: number | null
          owner_id: string
          saas_id: string
          verified_at: string | null
        }
        Insert: {
          customers?: number | null
          launched_on?: string | null
          livemode?: boolean | null
          mrr_cents?: number | null
          owner_id: string
          saas_id: string
          verified_at?: string | null
        }
        Update: {
          customers?: number | null
          launched_on?: string | null
          livemode?: boolean | null
          mrr_cents?: number | null
          owner_id?: string
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
      revenue_snapshots: {
        Row: {
          captured_at: string
          currencies: Json
          customers: number
          fx_date: string | null
          id: string
          livemode: boolean
          mrr_cents: number
          owner_id: string
          saas_id: string
          seq: number
        }
        Insert: {
          captured_at?: string
          currencies?: Json
          customers: number
          fx_date?: string | null
          id?: string
          livemode: boolean
          mrr_cents: number
          owner_id: string
          saas_id: string
          seq?: never
        }
        Update: {
          captured_at?: string
          currencies?: Json
          customers?: number
          fx_date?: string | null
          id?: string
          livemode?: boolean
          mrr_cents?: number
          owner_id?: string
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
          id: string
          logo_path: string | null
          name: string
          owner_id: string
          tagline: string
          updated_at: string
          website: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          id?: string
          logo_path?: string | null
          name: string
          owner_id: string
          tagline: string
          updated_at?: string
          website: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          logo_path?: string | null
          name?: string
          owner_id?: string
          tagline?: string
          updated_at?: string
          website?: string
        }
        Relationships: [
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
      stripe_connections: {
        Row: {
          connected_at: string
          encrypted_key: string
          key_hint: string
          last_error: string | null
          last_synced_at: string | null
          livemode: boolean
          owner_id: string
          saas_id: string
          status: string
        }
        Insert: {
          connected_at?: string
          encrypted_key: string
          key_hint: string
          last_error?: string | null
          last_synced_at?: string | null
          livemode: boolean
          owner_id: string
          saas_id: string
          status?: string
        }
        Update: {
          connected_at?: string
          encrypted_key?: string
          key_hint?: string
          last_error?: string | null
          last_synced_at?: string | null
          livemode?: boolean
          owner_id?: string
          saas_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_connections_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "stripe_connections_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "public_saas"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "stripe_connections_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "saas"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
    }
    Views: {
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
          name: string | null
          owner_avatar_path: string | null
          owner_id: string | null
          owner_name: string | null
          rank: number | null
          revenue_status: string | null
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
          name: string | null
          owner_avatar_path: string | null
          owner_id: string | null
          owner_name: string | null
          revenue_status: string | null
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      record_stripe_verification: {
        Args: {
          p_currencies: Json
          p_customers: number
          p_encrypted_key: string
          p_fx_date: string
          p_key_hint: string
          p_livemode: boolean
          p_mrr_cents: number
          p_saas_id: string
          p_subscription_hashes: string[]
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

