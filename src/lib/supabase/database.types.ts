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
      metric_reports: {
        Row: {
          customers: number | null
          id: string
          launched_on: string | null
          mrr_cents: number | null
          owner_id: string
          public_customers: boolean
          public_launch: boolean
          public_mrr: boolean
          reported_at: string
          saas_id: string
        }
        Insert: {
          customers?: number | null
          id?: string
          launched_on?: string | null
          mrr_cents?: number | null
          owner_id: string
          public_customers?: boolean
          public_launch?: boolean
          public_mrr?: boolean
          reported_at?: string
          saas_id: string
        }
        Update: {
          customers?: number | null
          id?: string
          launched_on?: string | null
          mrr_cents?: number | null
          owner_id?: string
          public_customers?: boolean
          public_launch?: boolean
          public_mrr?: boolean
          reported_at?: string
          saas_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metric_reports_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "leaderboard"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "metric_reports_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "public_saas"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "metric_reports_saas_id_owner_id_fkey"
            columns: ["saas_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "saas"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
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
          mrr_cents: number | null
          owner_id: string
          reported_at: string
          saas_id: string
        }
        Insert: {
          customers?: number | null
          launched_on?: string | null
          mrr_cents?: number | null
          owner_id: string
          reported_at?: string
          saas_id: string
        }
        Update: {
          customers?: number | null
          launched_on?: string | null
          mrr_cents?: number | null
          owner_id?: string
          reported_at?: string
          saas_id?: string
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
          logo_path: string | null
          mrr_cents: number | null
          name: string | null
          owner_avatar_path: string | null
          owner_id: string | null
          owner_name: string | null
          rank: number | null
          reported_at: string | null
          tagline: string | null
          updated_at: string | null
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
          logo_path: string | null
          mrr_cents: number | null
          name: string | null
          owner_avatar_path: string | null
          owner_id: string | null
          owner_name: string | null
          reported_at: string | null
          tagline: string | null
          updated_at: string | null
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
      save_saas: {
        Args: {
          p_category: string
          p_customers: number
          p_description: string
          p_id: string
          p_launched_on: string
          p_logo_path: string
          p_mrr_cents: number
          p_name: string
          p_public_customers: boolean
          p_public_launch: boolean
          p_public_mrr: boolean
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

