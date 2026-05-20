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
      ad_favorites: {
        Row: {
          ad_id: string | null
          ad_key: string
          body: string | null
          created_at: string
          href: string
          id: string
          page_id: string | null
          page_name: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          ad_id?: string | null
          ad_key: string
          body?: string | null
          created_at?: string
          href: string
          id?: string
          page_id?: string | null
          page_name?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          ad_id?: string | null
          ad_key?: string
          body?: string | null
          created_at?: string
          href?: string
          id?: string
          page_id?: string | null
          page_name?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ad_history: {
        Row: {
          ad_id: string | null
          ad_key: string
          body: string | null
          href: string
          id: string
          page_id: string | null
          page_name: string | null
          title: string | null
          user_id: string
          visited_at: string
        }
        Insert: {
          ad_id?: string | null
          ad_key: string
          body?: string | null
          href: string
          id?: string
          page_id?: string | null
          page_name?: string | null
          title?: string | null
          user_id: string
          visited_at?: string
        }
        Update: {
          ad_id?: string | null
          ad_key?: string
          body?: string | null
          href?: string
          id?: string
          page_id?: string | null
          page_name?: string | null
          title?: string | null
          user_id?: string
          visited_at?: string
        }
        Relationships: []
      }
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
      credit_transactions: {
        Row: {
          action: string
          cost: number
          created_at: string
          id: string
          label: string | null
          meta: Json | null
          user_id: string
        }
        Insert: {
          action: string
          cost?: number
          created_at?: string
          id?: string
          label?: string | null
          meta?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          cost?: number
          created_at?: string
          id?: string
          label?: string | null
          meta?: Json | null
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
      landing_analyses: {
        Row: {
          ads_found: Json
          analysis_text: string
          brand_name: string | null
          created_at: string
          domain: string
          id: string
          url: string
          user_id: string
        }
        Insert: {
          ads_found?: Json
          analysis_text: string
          brand_name?: string | null
          created_at?: string
          domain: string
          id?: string
          url: string
          user_id: string
        }
        Update: {
          ads_found?: Json
          analysis_text?: string
          brand_name?: string | null
          created_at?: string
          domain?: string
          id?: string
          url?: string
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
      master_keyword_runs: {
        Row: {
          ads_found: number
          error: string | null
          finished_at: string | null
          id: string
          keywords_used: string[]
          started_at: string
          success: boolean
          triggered_by: string
          winners_found: number
        }
        Insert: {
          ads_found?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          keywords_used?: string[]
          started_at?: string
          success?: boolean
          triggered_by?: string
          winners_found?: number
        }
        Update: {
          ads_found?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          keywords_used?: string[]
          started_at?: string
          success?: boolean
          triggered_by?: string
          winners_found?: number
        }
        Relationships: []
      }
      master_keyword_state: {
        Row: {
          created_at: string
          id: string
          is_paused: boolean
          keyword: string
          last_found_count: number
          last_run_at: string | null
          source_tier: string | null
          total_found: number
          total_runs: number
          total_winners: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_paused?: boolean
          keyword: string
          last_found_count?: number
          last_run_at?: string | null
          source_tier?: string | null
          total_found?: number
          total_runs?: number
          total_winners?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_paused?: boolean
          keyword?: string
          last_found_count?: number
          last_run_at?: string | null
          source_tier?: string | null
          total_found?: number
          total_runs?: number
          total_winners?: number
          updated_at?: string
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
      scraper_settings: {
        Row: {
          id: number
          interval_hours: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: number
          interval_hours?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: number
          interval_hours?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      system_learnings: {
        Row: {
          admin_note: string | null
          category: string | null
          created_at: string
          data_evidence: Json | null
          id: string
          insight: string
          reviewed_at: string | null
          reviewed_by: string | null
          source: string | null
          status: string
          week_date: string
        }
        Insert: {
          admin_note?: string | null
          category?: string | null
          created_at?: string
          data_evidence?: Json | null
          id?: string
          insight: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          status?: string
          week_date?: string
        }
        Update: {
          admin_note?: string | null
          category?: string | null
          created_at?: string
          data_evidence?: Json | null
          id?: string
          insight?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          status?: string
          week_date?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      set_scraper_cron: { Args: { p_hours: number }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
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
