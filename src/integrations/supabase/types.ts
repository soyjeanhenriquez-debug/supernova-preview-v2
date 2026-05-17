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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_favorite: boolean
          name: string
          system_prompt: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_favorite?: boolean
          name: string
          system_prompt: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_favorite?: boolean
          name?: string
          system_prompt?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          budget: number
          clicks: number
          conversions: number
          created_at: string
          ctr: number | null
          description: string | null
          end_date: string | null
          id: string
          impressions: number
          name: string
          objective: Database["public"]["Enums"]["campaign_objective"]
          platform: Database["public"]["Enums"]["campaign_platform"]
          roas: number | null
          spent: number
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          budget?: number
          clicks?: number
          conversions?: number
          created_at?: string
          ctr?: number | null
          description?: string | null
          end_date?: string | null
          id?: string
          impressions?: number
          name: string
          objective?: Database["public"]["Enums"]["campaign_objective"]
          platform?: Database["public"]["Enums"]["campaign_platform"]
          roas?: number | null
          spent?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          budget?: number
          clicks?: number
          conversions?: number
          created_at?: string
          ctr?: number | null
          description?: string | null
          end_date?: string | null
          id?: string
          impressions?: number
          name?: string
          objective?: Database["public"]["Enums"]["campaign_objective"]
          platform?: Database["public"]["Enums"]["campaign_platform"]
          roas?: number | null
          spent?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      keywords: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          keyword: string
          last_searched_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          keyword: string
          last_searched_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          keyword?: string
          last_searched_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      library_items: {
        Row: {
          category: string
          content: string
          created_at: string
          generator_type: string | null
          id: string
          is_favorite: boolean
          title: string
          user_id: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          generator_type?: string | null
          id?: string
          is_favorite?: boolean
          title: string
          user_id: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          generator_type?: string | null
          id?: string
          is_favorite?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_favorite: boolean
          name: string
          prompt_template: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_favorite?: boolean
          name: string
          prompt_template: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_favorite?: boolean
          name?: string
          prompt_template?: string
          user_id?: string
        }
        Relationships: []
      }
      winning_ads: {
        Row: {
          ad_body: string | null
          ad_description: string | null
          ad_format: string | null
          ad_title: string | null
          ad_url: string | null
          advertiser: string | null
          days_active: number | null
          delivery_start_time: string | null
          delivery_stop_time: string | null
          duplicate_count: number | null
          engagement_score: number | null
          id: string
          impressions_estimate: string | null
          impressions_lower: number | null
          impressions_upper: number | null
          is_confirmed_winner: boolean | null
          is_featured: boolean
          keyword: string
          market: string | null
          offer_type: string | null
          page_id: string | null
          page_name: string | null
          platform: string
          publisher_platforms: Json | null
          raw_data: Json | null
          scraped_at: string
          signals: Json | null
          tier: string | null
          winner_score: number | null
        }
        Insert: {
          ad_body?: string | null
          ad_description?: string | null
          ad_format?: string | null
          ad_title?: string | null
          ad_url?: string | null
          advertiser?: string | null
          days_active?: number | null
          delivery_start_time?: string | null
          delivery_stop_time?: string | null
          duplicate_count?: number | null
          engagement_score?: number | null
          id?: string
          impressions_estimate?: string | null
          impressions_lower?: number | null
          impressions_upper?: number | null
          is_confirmed_winner?: boolean | null
          is_featured?: boolean
          keyword: string
          market?: string | null
          offer_type?: string | null
          page_id?: string | null
          page_name?: string | null
          platform?: string
          publisher_platforms?: Json | null
          raw_data?: Json | null
          scraped_at?: string
          signals?: Json | null
          tier?: string | null
          winner_score?: number | null
        }
        Update: {
          ad_body?: string | null
          ad_description?: string | null
          ad_format?: string | null
          ad_title?: string | null
          ad_url?: string | null
          advertiser?: string | null
          days_active?: number | null
          delivery_start_time?: string | null
          delivery_stop_time?: string | null
          duplicate_count?: number | null
          engagement_score?: number | null
          id?: string
          impressions_estimate?: string | null
          impressions_lower?: number | null
          impressions_upper?: number | null
          is_confirmed_winner?: boolean | null
          is_featured?: boolean
          keyword?: string
          market?: string | null
          offer_type?: string | null
          page_id?: string | null
          page_name?: string | null
          platform?: string
          publisher_platforms?: Json | null
          raw_data?: Json | null
          scraped_at?: string
          signals?: Json | null
          tier?: string | null
          winner_score?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      campaign_objective:
        | "conversions"
        | "awareness"
        | "traffic"
        | "leads"
        | "engagement"
        | "app_installs"
      campaign_platform:
        | "Meta"
        | "Google"
        | "TikTok"
        | "LinkedIn"
        | "Twitter"
        | "YouTube"
        | "Other"
      campaign_status: "active" | "paused" | "draft" | "completed"
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
      campaign_objective: [
        "conversions",
        "awareness",
        "traffic",
        "leads",
        "engagement",
        "app_installs",
      ],
      campaign_platform: [
        "Meta",
        "Google",
        "TikTok",
        "LinkedIn",
        "Twitter",
        "YouTube",
        "Other",
      ],
      campaign_status: ["active", "paused", "draft", "completed"],
    },
  },
} as const
