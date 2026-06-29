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
      admin_logs: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string
          id: string
          metadata: Json
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity?: string
          entity_id?: string
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
          user_role: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
          user_role?: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
          user_role?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_assignments: {
        Row: {
          booking_id: string
          created_at: string
          decided_at: string | null
          guide_id: string
          id: string
          location_id: string | null
          reassignment_reason: string | null
          replaced_by: string | null
          replaces: string | null
          status: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          decided_at?: string | null
          guide_id: string
          id?: string
          location_id?: string | null
          reassignment_reason?: string | null
          replaced_by?: string | null
          replaces?: string | null
          status?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          decided_at?: string | null
          guide_id?: string
          id?: string
          location_id?: string | null
          reassignment_reason?: string | null
          replaced_by?: string | null
          replaces?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_assignments_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_assignments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_messages: {
        Row: {
          booking_id: string
          content: string
          created_at: string
          id: string
          kind: string
          sender_id: string | null
          sender_role: string
        }
        Insert: {
          booking_id: string
          content: string
          created_at?: string
          id?: string
          kind?: string
          sender_id?: string | null
          sender_role?: string
        }
        Update: {
          booking_id?: string
          content?: string
          created_at?: string
          id?: string
          kind?: string
          sender_id?: string | null
          sender_role?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          booking_date: string
          created_at: string
          emergency_contact_name: string
          emergency_contact_phone: string
          group_size: number
          id: string
          location_id: string | null
          notes: string
          qr_code_data: string
          requested_at: string | null
          requested_new_date: string | null
          status: string
          user_id: string
        }
        Insert: {
          booking_date: string
          created_at?: string
          emergency_contact_name?: string
          emergency_contact_phone?: string
          group_size?: number
          id?: string
          location_id?: string | null
          notes?: string
          qr_code_data?: string
          requested_at?: string | null
          requested_new_date?: string | null
          status?: string
          user_id: string
        }
        Update: {
          booking_date?: string
          created_at?: string
          emergency_contact_name?: string
          emergency_contact_phone?: string
          group_size?: number
          id?: string
          location_id?: string | null
          notes?: string
          qr_code_data?: string
          requested_at?: string | null
          requested_new_date?: string | null
          status?: string
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
        ]
      }
      checkpoint_surveys: {
        Row: {
          checkpoint_id: string
          created_at: string
          id: string
          response: Json
          session_id: string
        }
        Insert: {
          checkpoint_id: string
          created_at?: string
          id?: string
          response?: Json
          session_id: string
        }
        Update: {
          checkpoint_id?: string
          created_at?: string
          id?: string
          response?: Json
          session_id?: string
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
          description: string
          id: string
          latitude: number
          location_id: string
          longitude: number
          name: string
          order_index: number
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          latitude?: number
          location_id: string
          longitude?: number
          name: string
          order_index?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          latitude?: number
          location_id?: string
          longitude?: number
          name?: string
          order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "checkpoints_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
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
      guide_off_duty_requests: {
        Row: {
          created_at: string
          end_date: string
          guide_id: string
          id: string
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
        }
        Insert: {
          created_at?: string
          end_date: string
          guide_id: string
          id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          guide_id?: string
          id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
        }
        Relationships: []
      }
      guides: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          location_id: string
          per_trip_fee: number
          phone: string
          specialty: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          location_id: string
          per_trip_fee?: number
          phone?: string
          specialty?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          location_id?: string
          per_trip_fee?: number
          phone?: string
          specialty?: string
          status?: string
          updated_at?: string
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
          accuracy: number | null
          altitude: number
          heading: number | null
          id: string
          latitude: number
          longitude: number
          segment: string | null
          session_id: string
          speed_m_s: number | null
          timestamp: string
        }
        Insert: {
          accuracy?: number | null
          altitude?: number
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          segment?: string | null
          session_id: string
          speed_m_s?: number | null
          timestamp?: string
        }
        Update: {
          accuracy?: number | null
          altitude?: number
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          segment?: string | null
          session_id?: string
          speed_m_s?: number | null
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
          ascent_time_sec: number
          booking_id: string | null
          client_session_id: string | null
          created_at: string
          descent_started_at: string | null
          descent_time_sec: number
          elevation_gain_m: number
          elevation_loss_m: number
          encoded_path: string
          end_time: string | null
          id: string
          last_synced_at: string | null
          last_track_at: string | null
          location_id: string | null
          moving_time_sec: number
          participant_role: string
          peak_reached_at: string | null
          resting_time_sec: number
          start_time: string
          status: string
          summit_reached: boolean
          total_distance_km: number
          tracking_phase: string
          trail_zone_id: string | null
          user_id: string
        }
        Insert: {
          ascent_time_sec?: number
          booking_id?: string | null
          client_session_id?: string | null
          created_at?: string
          descent_started_at?: string | null
          descent_time_sec?: number
          elevation_gain_m?: number
          elevation_loss_m?: number
          encoded_path?: string
          end_time?: string | null
          id?: string
          last_synced_at?: string | null
          last_track_at?: string | null
          location_id?: string | null
          moving_time_sec?: number
          participant_role?: string
          peak_reached_at?: string | null
          resting_time_sec?: number
          start_time?: string
          status?: string
          summit_reached?: boolean
          total_distance_km?: number
          tracking_phase?: string
          trail_zone_id?: string | null
          user_id: string
        }
        Update: {
          ascent_time_sec?: number
          booking_id?: string | null
          client_session_id?: string | null
          created_at?: string
          descent_started_at?: string | null
          descent_time_sec?: number
          elevation_gain_m?: number
          elevation_loss_m?: number
          encoded_path?: string
          end_time?: string | null
          id?: string
          last_synced_at?: string | null
          last_track_at?: string | null
          location_id?: string | null
          moving_time_sec?: number
          participant_role?: string
          peak_reached_at?: string | null
          resting_time_sec?: number
          start_time?: string
          status?: string
          summit_reached?: boolean
          total_distance_km?: number
          tracking_phase?: string
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
          age: number | null
          avatar_url: string
          created_at: string
          data_consent_at: string | null
          emergency_contact: string
          full_name: string
          id: string
          liability_waiver_at: string | null
          onboarding_completed_at: string | null
          phone: string
          privacy_accepted_at: string | null
          terms_accepted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          age?: number | null
          avatar_url?: string
          created_at?: string
          data_consent_at?: string | null
          emergency_contact?: string
          full_name?: string
          id?: string
          liability_waiver_at?: string | null
          onboarding_completed_at?: string | null
          phone?: string
          privacy_accepted_at?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          age?: number | null
          avatar_url?: string
          created_at?: string
          data_consent_at?: string | null
          emergency_contact?: string
          full_name?: string
          id?: string
          liability_waiver_at?: string | null
          onboarding_completed_at?: string | null
          phone?: string
          privacy_accepted_at?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rescue_points: {
        Row: {
          created_at: string
          description: string
          id: string
          latitude: number
          location_id: string | null
          longitude: number
          name: string
          type: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          latitude: number
          location_id?: string | null
          longitude: number
          name: string
          type?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          latitude?: number
          location_id?: string | null
          longitude?: number
          name?: string
          type?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          created_at: string
          id: string
          is_approved: boolean
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
          rating?: number
          review_text?: string
          reviewer_name?: string
          trail_name?: string
          user_id?: string
        }
        Relationships: []
      }
      trail_reports: {
        Row: {
          condition: string
          created_at: string
          description: string
          id: string
          ranger_id: string
          zone_id: string
        }
        Insert: {
          condition?: string
          created_at?: string
          description?: string
          id?: string
          ranger_id: string
          zone_id: string
        }
        Update: {
          condition?: string
          created_at?: string
          description?: string
          id?: string
          ranger_id?: string
          zone_id?: string
        }
        Relationships: [
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
          description: string
          difficulty: string
          elevation_meters: number
          id: string
          is_official: boolean
          location_id: string | null
          max_capacity: number
          name: string
          official_at: string | null
          recorded_by: string | null
          review_status: string
          source: string
          status: string
        }
        Insert: {
          coordinates_json?: Json
          created_at?: string
          description?: string
          difficulty?: string
          elevation_meters?: number
          id?: string
          is_official?: boolean
          location_id?: string | null
          max_capacity?: number
          name: string
          official_at?: string | null
          recorded_by?: string | null
          review_status?: string
          source?: string
          status?: string
        }
        Update: {
          coordinates_json?: Json
          created_at?: string
          description?: string
          difficulty?: string
          elevation_meters?: number
          id?: string
          is_official?: boolean
          location_id?: string | null
          max_capacity?: number
          name?: string
          official_at?: string | null
          recorded_by?: string | null
          review_status?: string
          source?: string
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
          id: string
          location_id: string
          user_id: string
        }
        Insert: {
          id?: string
          location_id: string
          user_id: string
        }
        Update: {
          id?: string
          location_id?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "ranger" | "guide" | "hiker"
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
      app_role: ["super_admin", "admin", "ranger", "guide", "hiker"],
    },
  },
} as const
