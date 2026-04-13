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
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          uploaded_by: string
          visit_report_id: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          uploaded_by: string
          visit_report_id?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          uploaded_by?: string
          visit_report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_visit_report_id_fkey"
            columns: ["visit_report_id"]
            isOneToOne: false
            referencedRelation: "visit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_zones: {
        Row: {
          cities: string[]
          color: string | null
          created_at: string
          custom_label: string | null
          id: string
          polygon_coordinates: Json | null
          postal_codes: string[]
          system_name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cities?: string[]
          color?: string | null
          created_at?: string
          custom_label?: string | null
          id?: string
          polygon_coordinates?: Json | null
          postal_codes?: string[]
          system_name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cities?: string[]
          color?: string | null
          created_at?: string
          custom_label?: string | null
          id?: string
          polygon_coordinates?: Json | null
          postal_codes?: string[]
          system_name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string
          customer_id: string
          email: string | null
          first_name: string
          id: string
          is_primary: boolean | null
          last_name: string
          phone: string | null
          role: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          email?: string | null
          first_name: string
          id?: string
          is_primary?: boolean | null
          last_name: string
          phone?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          email?: string | null
          first_name?: string
          id?: string
          is_primary?: boolean | null
          last_name?: string
          phone?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_requests: {
        Row: {
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          requested_by: string
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          requested_by: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          requested_by?: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversion_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          account_status: string
          activity_type: string | null
          address: string | null
          annual_revenue_potential: number | null
          assigned_rep_id: string | null
          assignment_mode: string | null
          assignment_source: string | null
          city: string | null
          company_name: string
          created_at: string
          customer_type: string
          email: string | null
          equipment_type: string | null
          equipment_types: string[] | null
          exceptional_commercial_id: string | null
          exceptional_reason: string | null
          fleet_car_bus: number
          fleet_pl: number
          fleet_remorque: number
          fleet_vu: number
          id: string
          last_visit_date: string | null
          latitude: number | null
          longitude: number | null
          management_mode: string
          next_action_date: string | null
          next_action_description: string | null
          notes: string | null
          number_of_vehicles: number | null
          phone: string | null
          postal_code: string | null
          preferred_visit_day: string | null
          relationship_type: string | null
          rep_assignment_mode: string
          sales_potential: string | null
          updated_at: string
          visit_duration_minutes: number | null
          visit_frequency: string | null
          website: string | null
          zone: string | null
          zone_status: string | null
        }
        Insert: {
          account_status?: string
          activity_type?: string | null
          address?: string | null
          annual_revenue_potential?: number | null
          assigned_rep_id?: string | null
          assignment_mode?: string | null
          assignment_source?: string | null
          city?: string | null
          company_name: string
          created_at?: string
          customer_type?: string
          email?: string | null
          equipment_type?: string | null
          equipment_types?: string[] | null
          exceptional_commercial_id?: string | null
          exceptional_reason?: string | null
          fleet_car_bus?: number
          fleet_pl?: number
          fleet_remorque?: number
          fleet_vu?: number
          id?: string
          last_visit_date?: string | null
          latitude?: number | null
          longitude?: number | null
          management_mode?: string
          next_action_date?: string | null
          next_action_description?: string | null
          notes?: string | null
          number_of_vehicles?: number | null
          phone?: string | null
          postal_code?: string | null
          preferred_visit_day?: string | null
          relationship_type?: string | null
          rep_assignment_mode?: string
          sales_potential?: string | null
          updated_at?: string
          visit_duration_minutes?: number | null
          visit_frequency?: string | null
          website?: string | null
          zone?: string | null
          zone_status?: string | null
        }
        Update: {
          account_status?: string
          activity_type?: string | null
          address?: string | null
          annual_revenue_potential?: number | null
          assigned_rep_id?: string | null
          assignment_mode?: string | null
          assignment_source?: string | null
          city?: string | null
          company_name?: string
          created_at?: string
          customer_type?: string
          email?: string | null
          equipment_type?: string | null
          equipment_types?: string[] | null
          exceptional_commercial_id?: string | null
          exceptional_reason?: string | null
          fleet_car_bus?: number
          fleet_pl?: number
          fleet_remorque?: number
          fleet_vu?: number
          id?: string
          last_visit_date?: string | null
          latitude?: number | null
          longitude?: number | null
          management_mode?: string
          next_action_date?: string | null
          next_action_description?: string | null
          notes?: string | null
          number_of_vehicles?: number | null
          phone?: string | null
          postal_code?: string | null
          preferred_visit_day?: string | null
          relationship_type?: string | null
          rep_assignment_mode?: string
          sales_potential?: string | null
          updated_at?: string
          visit_duration_minutes?: number | null
          visit_frequency?: string | null
          website?: string | null
          zone?: string | null
          zone_status?: string | null
        }
        Relationships: []
      }
      monthly_revenues: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          import_batch_id: string | null
          imported_by: string
          month: number
          monthly_revenue: number
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          import_batch_id?: string | null
          imported_by: string
          month: number
          monthly_revenue?: number
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          import_batch_id?: string | null
          imported_by?: string
          month?: number
          monthly_revenue?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_revenues_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          created_at: string
          customer_id: string
          estimated_amount: number | null
          expected_close_date: string | null
          id: string
          notes: string | null
          probability: number | null
          rep_id: string
          stage: string
          title: string
          updated_at: string
          visit_report_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          estimated_amount?: number | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          probability?: number | null
          rep_id: string
          stage?: string
          title: string
          updated_at?: string
          visit_report_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          estimated_amount?: number | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          probability?: number | null
          rep_id?: string
          stage?: string
          title?: string
          updated_at?: string
          visit_report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_visit_report_id_fkey"
            columns: ["visit_report_id"]
            isOneToOne: false
            referencedRelation: "visit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          phone?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          discount_value: number | null
          end_date: string
          id: string
          image_url: string | null
          pdf_url: string | null
          product_or_category: string | null
          promotion_type: string
          start_date: string
          target_customer_type: string | null
          target_region: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          discount_value?: number | null
          end_date: string
          id?: string
          image_url?: string | null
          pdf_url?: string | null
          product_or_category?: string | null
          promotion_type?: string
          start_date: string
          target_customer_type?: string | null
          target_region?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          discount_value?: number | null
          end_date?: string
          id?: string
          image_url?: string | null
          pdf_url?: string | null
          product_or_category?: string | null
          promotion_type?: string
          start_date?: string
          target_customer_type?: string | null
          target_region?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      revenue_import_logs: {
        Row: {
          created_at: string
          details: Json | null
          file_name: string
          id: string
          rows_created: number
          rows_errors: number
          rows_matched: number
          rows_skipped: number
          rows_updated: number
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          file_name: string
          id?: string
          rows_created?: number
          rows_errors?: number
          rows_matched?: number
          rows_skipped?: number
          rows_updated?: number
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          file_name?: string
          id?: string
          rows_created?: number
          rows_errors?: number
          rows_matched?: number
          rows_skipped?: number
          rows_updated?: number
          user_id?: string
        }
        Relationships: []
      }
      route_stops: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          planned_time: string | null
          route_id: string
          status: string
          stop_order: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          planned_time?: string | null
          route_id: string
          status?: string
          stop_order: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          planned_time?: string | null
          route_id?: string
          status?: string
          stop_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "route_stops_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          created_at: string
          estimated_duration_min: number | null
          id: string
          notes: string | null
          rep_id: string
          route_date: string
          status: string
          total_distance_km: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          estimated_duration_min?: number | null
          id?: string
          notes?: string | null
          rep_id: string
          route_date: string
          status?: string
          total_distance_km?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          estimated_duration_min?: number | null
          id?: string
          notes?: string | null
          rep_id?: string
          route_date?: string
          status?: string
          total_distance_km?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string
          completed_at: string | null
          created_at: string
          created_by: string
          customer_id: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string
          status: string
          title: string
          updated_at: string
          visit_report_id: string | null
        }
        Insert: {
          assigned_to: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
          visit_report_id?: string | null
        }
        Update: {
          assigned_to?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
          visit_report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_visit_report_id_fkey"
            columns: ["visit_report_id"]
            isOneToOne: false
            referencedRelation: "visit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_type_potentials: {
        Row: {
          annual_potential: number
          created_at: string
          id: string
          label: string
          updated_at: string
          vehicle_type: string
        }
        Insert: {
          annual_potential?: number
          created_at?: string
          id?: string
          label: string
          updated_at?: string
          vehicle_type: string
        }
        Update: {
          annual_potential?: number
          created_at?: string
          id?: string
          label?: string
          updated_at?: string
          vehicle_type?: string
        }
        Relationships: []
      }
      visit_reports: {
        Row: {
          competitor_info: string | null
          contact_id: string | null
          created_at: string
          customer_id: string
          customer_needs: string | null
          ended_at: string | null
          follow_up_date: string | null
          id: string
          next_actions: string | null
          opportunities_detected: string | null
          promotion_id: string | null
          promotion_presented: boolean | null
          quick_outcome: string | null
          rep_id: string
          route_stop_id: string | null
          started_at: string | null
          summary: string | null
          updated_at: string
          visit_date: string
          visit_purpose: string | null
          visit_status: string
        }
        Insert: {
          competitor_info?: string | null
          contact_id?: string | null
          created_at?: string
          customer_id: string
          customer_needs?: string | null
          ended_at?: string | null
          follow_up_date?: string | null
          id?: string
          next_actions?: string | null
          opportunities_detected?: string | null
          promotion_id?: string | null
          promotion_presented?: boolean | null
          quick_outcome?: string | null
          rep_id: string
          route_stop_id?: string | null
          started_at?: string | null
          summary?: string | null
          updated_at?: string
          visit_date?: string
          visit_purpose?: string | null
          visit_status?: string
        }
        Update: {
          competitor_info?: string | null
          contact_id?: string | null
          created_at?: string
          customer_id?: string
          customer_needs?: string | null
          ended_at?: string | null
          follow_up_date?: string | null
          id?: string
          next_actions?: string | null
          opportunities_detected?: string | null
          promotion_id?: string | null
          promotion_presented?: boolean | null
          quick_outcome?: string | null
          rep_id?: string
          route_stop_id?: string | null
          started_at?: string | null
          summary?: string | null
          updated_at?: string
          visit_date?: string
          visit_purpose?: string | null
          visit_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_reports_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_reports_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_reports_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_reports_route_stop_id_fkey"
            columns: ["route_stop_id"]
            isOneToOne: false
            referencedRelation: "route_stops"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_zone_planning: {
        Row: {
          created_at: string
          day_of_week: number
          id: string
          updated_at: string
          user_id: string
          week_number: number
          zone_id: string | null
        }
        Insert: {
          created_at?: string
          day_of_week: number
          id?: string
          updated_at?: string
          user_id: string
          week_number?: number
          zone_id?: string | null
        }
        Update: {
          created_at?: string
          day_of_week?: number
          id?: string
          updated_at?: string
          user_id?: string
          week_number?: number
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_zone_planning_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "commercial_zones"
            referencedColumns: ["id"]
          },
        ]
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
      is_admin_or_manager: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "manager" | "sales_rep" | "executive"
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
      app_role: ["admin", "manager", "sales_rep", "executive"],
    },
  },
} as const
