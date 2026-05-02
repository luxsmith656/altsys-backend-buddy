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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      booking_assignments: {
        Row: {
          booking_id: string
          created_at: string
          decided_at: string | null
          decline_reason: string
          guide_id: string
          id: string
          location_id: string
          status: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          decided_at?: string | null
          decline_reason?: string
          guide_id: string
          id?: string
          location_id: string
          status?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          decided_at?: string | null
          decline_reason?: string
          guide_id?: string
          id?: string
          location_id?: string
          status?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          age_bracket: string
          booking_date: string
          created_at: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          entry_fee: number
          gender: string
          group_size: number
          group_type: string
          guide_fee: number
          id: string
          location_id: string | null
          notes: string | null
          origin_city: string
          payment_status: string
          preferred_guide_id: string | null
          qr_code_data: string | null
          start_location_id: string | null
          status: string
          total_amount: number
          user_id: string
        }
        Insert: {
          age_bracket?: string
          booking_date: string
          created_at?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          entry_fee?: number
          gender?: string
          group_size?: number
          group_type?: string
          guide_fee?: number
          id?: string
          location_id?: string | null
          notes?: string | null
          origin_city?: string
          payment_status?: string
          preferred_guide_id?: string | null
          qr_code_data?: string | null
          start_location_id?: string | null
          status?: string
          total_amount?: number
          user_id: string
        }
        Update: {
          age_bracket?: string
          booking_date?: string
          created_at?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          entry_fee?: number
          gender?: string
          group_size?: number
          group_type?: string
          guide_fee?: number
          id?: string
          location_id?: string | null
          notes?: string | null
          origin_city?: string
          payment_status?: string
          preferred_guide_id?: string | null
          qr_code_data?: string | null
          start_location_id?: string | null
          status?: string
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_start_location_id_fkey"
            columns: ["start_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      checkpoint_surveys: {
        Row: {
          checkpoint_id: string
          created_at: string
          experience: string
          id: string
          location_id: string
          notes: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          checkpoint_id: string
          created_at?: string
          experience?: string
          id?: string
          location_id: string
          notes?: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          checkpoint_id?: string
          created_at?: string
          experience?: string
          id?: string
          location_id?: string
          notes?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoint_surveys_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_surveys_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_surveys_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "hiker_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoints: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          latitude: number
          location_id: string
          longitude: number
          name: string
          order_index: number
          trail_zone_id: string | null
          trigger_radius_m: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          latitude: number
          location_id: string
          longitude: number
          name: string
          order_index?: number
          trail_zone_id?: string | null
          trigger_radius_m?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          latitude?: number
          location_id?: string
          longitude?: number
          name?: string
          order_index?: number
          trail_zone_id?: string | null
          trigger_radius_m?: number
        }
        Relationships: [
          {
            foreignKeyName: "checkpoints_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoints_trail_zone_id_fkey"
            columns: ["trail_zone_id"]
            isOneToOne: false
            referencedRelation: "trail_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_capacity: {
        Row: {
          current_count: number
          date: string
          id: string
          location_id: string | null
          max_capacity: number
        }
        Insert: {
          current_count?: number
          date: string
          id?: string
          location_id?: string | null
          max_capacity?: number
        }
        Update: {
          current_count?: number
          date?: string
          id?: string
          location_id?: string | null
          max_capacity?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_capacity_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      events_calendar: {
        Row: {
          created_at: string
          created_by: string | null
          effect: string
          effect_magnitude: number
          end_date: string
          event_type: string
          id: string
          location_id: string | null
          notes: string
          start_date: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effect?: string
          effect_magnitude?: number
          end_date: string
          event_type?: string
          id?: string
          location_id?: string | null
          notes?: string
          start_date: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effect?: string
          effect_magnitude?: number
          end_date?: string
          event_type?: string
          id?: string
          location_id?: string | null
          notes?: string
          start_date?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_calendar_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      forecasts: {
        Row: {
          created_by: string | null
          data_json: Json
          explanation: string
          generated_at: string
          horizon: string
          id: string
          location_id: string | null
        }
        Insert: {
          created_by?: string | null
          data_json?: Json
          explanation?: string
          generated_at?: string
          horizon?: string
          id?: string
          location_id?: string | null
        }
        Update: {
          created_by?: string | null
          data_json?: Json
          explanation?: string
          generated_at?: string
          horizon?: string
          id?: string
          location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forecasts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      guide_incidents: {
        Row: {
          booking_id: string | null
          created_at: string
          description: string
          guide_id: string
          id: string
          incident_type: string
          location_id: string
          occurred_at: string
          reported_by: string | null
          resolved: boolean
          severity: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          description?: string
          guide_id: string
          id?: string
          incident_type?: string
          location_id: string
          occurred_at?: string
          reported_by?: string | null
          resolved?: boolean
          severity?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          description?: string
          guide_id?: string
          id?: string
          incident_type?: string
          location_id?: string
          occurred_at?: string
          reported_by?: string | null
          resolved?: boolean
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "guide_incidents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guide_incidents_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guide_incidents_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          bio: string
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          languages: string
          location_id: string
          per_trip_fee: number
          photo_url: string
          specialty: string
          user_id: string | null
        }
        Insert: {
          bio?: string
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          languages?: string
          location_id: string
          per_trip_fee?: number
          photo_url?: string
          specialty?: string
          user_id?: string | null
        }
        Update: {
          bio?: string
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          languages?: string
          location_id?: string
          per_trip_fee?: number
          photo_url?: string
          specialty?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      hiker_locations: {
        Row: {
          altitude: number | null
          id: string
          latitude: number
          longitude: number
          session_id: string
          timestamp: string
        }
        Insert: {
          altitude?: number | null
          id?: string
          latitude: number
          longitude: number
          session_id: string
          timestamp?: string
        }
        Update: {
          altitude?: number | null
          id?: string
          latitude?: number
          longitude?: number
          session_id?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "hiker_locations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "hiker_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      hiker_sessions: {
        Row: {
          booking_id: string | null
          created_at: string
          end_time: string | null
          id: string
          location_id: string | null
          start_time: string
          status: string
          total_distance_km: number | null
          trail_zone_id: string | null
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          location_id?: string | null
          start_time?: string
          status?: string
          total_distance_km?: number | null
          trail_zone_id?: string | null
          user_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          location_id?: string | null
          start_time?: string
          status?: string
          total_distance_km?: number | null
          trail_zone_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hiker_sessions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiker_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiker_sessions_trail_zone_id_fkey"
            columns: ["trail_zone_id"]
            isOneToOne: false
            referencedRelation: "trail_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string
          center_lat: number
          center_lng: number
          created_at: string
          currency: string
          default_guide_fee: number
          description: string
          entry_fee: number
          id: string
          lgu: string
          name: string
          region: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          address?: string
          center_lat?: number
          center_lng?: number
          created_at?: string
          currency?: string
          default_guide_fee?: number
          description?: string
          entry_fee?: number
          id?: string
          lgu?: string
          name: string
          region?: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string
          center_lat?: number
          center_lng?: number
          created_at?: string
          currency?: string
          default_guide_fee?: number
          description?: string
          entry_fee?: number
          id?: string
          lgu?: string
          name?: string
          region?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          emergency_contact: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          emergency_contact?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          emergency_contact?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          created_at: string
          id: string
          is_approved: boolean
          location_id: string | null
          rating: number
          review_text: string
          reviewer_name: string
          trail_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_approved?: boolean
          location_id?: string | null
          rating?: number
          review_text?: string
          reviewer_name?: string
          trail_name?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_approved?: boolean
          location_id?: string | null
          rating?: number
          review_text?: string
          reviewer_name?: string
          trail_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      trail_reports: {
        Row: {
          condition: string
          created_at: string
          description: string | null
          id: string
          location_id: string | null
          ranger_id: string
          zone_id: string
        }
        Insert: {
          condition?: string
          created_at?: string
          description?: string | null
          id?: string
          location_id?: string | null
          ranger_id: string
          zone_id: string
        }
        Update: {
          condition?: string
          created_at?: string
          description?: string | null
          id?: string
          location_id?: string | null
          ranger_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trail_reports_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trail_reports_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "trail_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      trail_zones: {
        Row: {
          coordinates_json: Json
          created_at: string
          description: string | null
          difficulty: string
          elevation_meters: number | null
          id: string
          location_id: string | null
          max_capacity: number
          name: string
          status: string
        }
        Insert: {
          coordinates_json?: Json
          created_at?: string
          description?: string | null
          difficulty?: string
          elevation_meters?: number | null
          id?: string
          location_id?: string | null
          max_capacity?: number
          name: string
          status?: string
        }
        Update: {
          coordinates_json?: Json
          created_at?: string
          description?: string | null
          difficulty?: string
          elevation_meters?: number | null
          id?: string
          location_id?: string | null
          max_capacity?: number
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "trail_zones_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_locations: {
        Row: {
          created_at: string
          id: string
          location_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
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
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_guide_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      manages_location: {
        Args: { _location_id: string; _user_id: string }
        Returns: boolean
      }
      works_at_location: {
        Args: { _location_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "ranger" | "hiker" | "super_admin" | "guide"
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
      app_role: ["admin", "ranger", "hiker", "super_admin", "guide"],
    },
  },
} as const
