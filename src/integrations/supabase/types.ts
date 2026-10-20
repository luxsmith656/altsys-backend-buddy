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
      ai_tool_logs: {
        Row: {
          allowed: boolean
          created_at: string
          denied_reason: string | null
          id: string
          location_scope: Json
          params: Json
          role: string | null
          row_count: number
          tool_name: string
          user_id: string
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          denied_reason?: string | null
          id?: string
          location_scope?: Json
          params?: Json
          role?: string | null
          row_count?: number
          tool_name: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          denied_reason?: string | null
          id?: string
          location_scope?: Json
          params?: Json
          role?: string | null
          row_count?: number
          tool_name?: string
          user_id?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          body: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expires_at: string | null
          id: string
          is_important: boolean
          lifecycle_status: string
          location_id: string | null
          rejection_reason: string | null
          source: string | null
          starts_at: string | null
          target: string
          title: string
          type: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id: string
          is_important?: boolean
          lifecycle_status?: string
          location_id?: string | null
          rejection_reason?: string | null
          source?: string | null
          starts_at?: string | null
          target?: string
          title: string
          type?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          is_important?: boolean
          lifecycle_status?: string
          location_id?: string | null
          rejection_reason?: string | null
          source?: string | null
          starts_at?: string | null
          target?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_notifications: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          read: boolean
          reference_id: string | null
          route: string | null
          sender_id: string | null
          target_id: string | null
          target_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          read?: boolean
          reference_id?: string | null
          route?: string | null
          sender_id?: string | null
          target_id?: string | null
          target_type?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          read?: boolean
          reference_id?: string | null
          route?: string | null
          sender_id?: string | null
          target_id?: string | null
          target_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      backup_snapshots: {
        Row: {
          created_at: string
          exported_at: string
          fingerprint: string
          id: string
          location_ids: string[]
          owner_id: string
          payload: Json
          payload_bytes: number
          payload_encoding: string
          scope_role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          exported_at?: string
          fingerprint: string
          id?: string
          location_ids?: string[]
          owner_id: string
          payload: Json
          payload_bytes?: number
          payload_encoding?: string
          scope_role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          exported_at?: string
          fingerprint?: string
          id?: string
          location_ids?: string[]
          owner_id?: string
          payload?: Json
          payload_bytes?: number
          payload_encoding?: string
          scope_role?: string
          updated_at?: string
        }
        Relationships: []
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
      booking_capacity_audit: {
        Row: {
          changed_by: string | null
          created_at: string
          flagged_booking_count: number
          flagged_summary: Json
          id: string
          new_config: Json
          old_config: Json
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          flagged_booking_count?: number
          flagged_summary?: Json
          id?: string
          new_config: Json
          old_config: Json
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          flagged_booking_count?: number
          flagged_summary?: Json
          id?: string
          new_config?: Json
          old_config?: Json
        }
        Relationships: []
      }
      booking_capacity_settings: {
        Row: {
          capacity_mode: string
          hold_pending: boolean
          id: number
          max_people_per_group: number
          max_people_per_slot: number | null
          shared_max_groups: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          capacity_mode?: string
          hold_pending?: boolean
          id?: number
          max_people_per_group?: number
          max_people_per_slot?: number | null
          shared_max_groups?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          capacity_mode?: string
          hold_pending?: boolean
          id?: number
          max_people_per_group?: number
          max_people_per_slot?: number | null
          shared_max_groups?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      booking_capacity_trailhead_overrides: {
        Row: {
          location_id: string
          max_groups: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          location_id: string
          max_groups?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          location_id?: string
          max_groups?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_capacity_trailhead_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_companion_claims: {
        Row: {
          booking_id: string
          claimed_at: string
          claimed_by: string | null
          claimed_device_id: string | null
          companion_index: number
          companion_name: string
          id: string
        }
        Insert: {
          booking_id: string
          claimed_at?: string
          claimed_by?: string | null
          claimed_device_id?: string | null
          companion_index: number
          companion_name: string
          id?: string
        }
        Update: {
          booking_id?: string
          claimed_at?: string
          claimed_by?: string | null
          claimed_device_id?: string | null
          companion_index?: number
          companion_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_companion_claims_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_confirmation_emails: {
        Row: {
          attempts: number
          booking_id: string
          created_at: string
          first_attempt_at: string | null
          last_error: string | null
          lease_until: string | null
          next_attempt_at: string
          payload: Json | null
          provider_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          booking_id: string
          created_at?: string
          first_attempt_at?: string | null
          last_error?: string | null
          lease_until?: string | null
          next_attempt_at?: string
          payload?: Json | null
          provider_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          booking_id?: string
          created_at?: string
          first_attempt_at?: string | null
          last_error?: string | null
          lease_until?: string | null
          next_attempt_at?: string
          payload?: Json | null
          provider_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_confirmation_emails_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
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
          recipient_role: string | null
          sender_id: string | null
          sender_role: string
        }
        Insert: {
          booking_id: string
          content: string
          created_at?: string
          id?: string
          kind?: string
          recipient_role?: string | null
          sender_id?: string | null
          sender_role?: string
        }
        Update: {
          booking_id?: string
          content?: string
          created_at?: string
          id?: string
          kind?: string
          recipient_role?: string | null
          sender_id?: string | null
          sender_role?: string
        }
        Relationships: []
      }
      booking_schedule_settings: {
        Row: {
          id: string
          location_id: string | null
          schedule: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          location_id?: string | null
          schedule?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          location_id?: string | null
          schedule?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_schedule_settings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_date: string
          capacity_flag_reason: string | null
          capacity_flagged_at: string | null
          capacity_status: string
          companion_join_code: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          emergency_contact_name: string
          emergency_contact_phone: string
          group_size: number
          id: string
          location_id: string | null
          notes: string
          qr_code_data: string
          referral_guide_id: string | null
          requested_at: string | null
          requested_new_date: string | null
          status: string
          total_amount: number | null
          user_id: string
        }
        Insert: {
          booking_date: string
          capacity_flag_reason?: string | null
          capacity_flagged_at?: string | null
          capacity_status?: string
          companion_join_code?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          emergency_contact_name?: string
          emergency_contact_phone?: string
          group_size?: number
          id?: string
          location_id?: string | null
          notes?: string
          qr_code_data?: string
          referral_guide_id?: string | null
          requested_at?: string | null
          requested_new_date?: string | null
          status?: string
          total_amount?: number | null
          user_id: string
        }
        Update: {
          booking_date?: string
          capacity_flag_reason?: string | null
          capacity_flagged_at?: string | null
          capacity_status?: string
          companion_join_code?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          emergency_contact_name?: string
          emergency_contact_phone?: string
          group_size?: number
          id?: string
          location_id?: string | null
          notes?: string
          qr_code_data?: string
          referral_guide_id?: string | null
          requested_at?: string | null
          requested_new_date?: string | null
          status?: string
          total_amount?: number | null
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
            foreignKeyName: "bookings_referral_guide_id_fkey"
            columns: ["referral_guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
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
          day_current_count: number
          day_max_capacity: number | null
          id: string
          location_id: string | null
          max_capacity: number
          night_current_count: number
          night_max_capacity: number | null
        }
        Insert: {
          current_count?: number
          date: string
          day_current_count?: number
          day_max_capacity?: number | null
          id?: string
          location_id?: string | null
          max_capacity?: number
          night_current_count?: number
          night_max_capacity?: number | null
        }
        Update: {
          current_count?: number
          date?: string
          day_current_count?: number
          day_max_capacity?: number | null
          id?: string
          location_id?: string | null
          max_capacity?: number
          night_current_count?: number
          night_max_capacity?: number | null
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
      email_otp_challenges: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          id: string
          used_at: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          used_at?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          used_at?: string | null
        }
        Relationships: []
      }
      emergency_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          booking_id: string | null
          client_alert_id: string | null
          created_at: string
          id: string
          latitude: number | null
          location_id: string | null
          longitude: number | null
          message: string
          reporter_role: string
          resolved_at: string | null
          resolved_by: string | null
          session_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          booking_id?: string | null
          client_alert_id?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          location_id?: string | null
          longitude?: number | null
          message?: string
          reporter_role?: string
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          booking_id?: string | null
          client_alert_id?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          location_id?: string | null
          longitude?: number | null
          message?: string
          reporter_role?: string
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_alerts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_alerts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "hiker_sessions"
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
          request_type: string
          review_note: string | null
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
          request_type?: string
          review_note?: string | null
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
          request_type?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
        }
        Relationships: []
      }
      guide_reviews: {
        Row: {
          booking_id: string | null
          comment: string
          created_at: string
          guide_id: string
          id: string
          is_approved: boolean
          rating: number
          reviewer_id: string
          reviewer_name: string
        }
        Insert: {
          booking_id?: string | null
          comment?: string
          created_at?: string
          guide_id: string
          id?: string
          is_approved?: boolean
          rating: number
          reviewer_id: string
          reviewer_name?: string
        }
        Update: {
          booking_id?: string | null
          comment?: string
          created_at?: string
          guide_id?: string
          id?: string
          is_approved?: boolean
          rating?: number
          reviewer_id?: string
          reviewer_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "guide_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guide_reviews_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          age: number | null
          created_at: string
          facebook_url: string | null
          full_name: string
          id: string
          is_active: boolean
          location_id: string
          onboarding_completed_at: string | null
          per_trip_fee: number
          phone: string
          photo_url: string | null
          referral_code: string | null
          sex: string | null
          specialty: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          age?: number | null
          created_at?: string
          facebook_url?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          location_id: string
          onboarding_completed_at?: string | null
          per_trip_fee?: number
          phone?: string
          photo_url?: string | null
          referral_code?: string | null
          sex?: string | null
          specialty?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          age?: number | null
          created_at?: string
          facebook_url?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          location_id?: string
          onboarding_completed_at?: string | null
          per_trip_fee?: number
          phone?: string
          photo_url?: string | null
          referral_code?: string | null
          sex?: string | null
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
      hike_station_reports: {
        Row: {
          accuracy: number | null
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          reported_at: string
          session_id: string
          station: number
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          id: string
          latitude?: number | null
          longitude?: number | null
          reported_at: string
          session_id: string
          station: number
          user_id: string
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          reported_at?: string
          session_id?: string
          station?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hike_station_reports_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "hiker_sessions"
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
      kb_chunks: {
        Row: {
          category: string
          content: string
          content_hash: string
          created_at: string
          embedding: string | null
          id: string
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          content_hash: string
          created_at?: string
          embedding?: string | null
          id?: string
          source?: string
          title?: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          content_hash?: string
          created_at?: string
          embedding?: string | null
          id?: string
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
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
      mdrrmo_access_logs: {
        Row: {
          access_type: string
          accessed_at: string
          booking_id: string | null
          id: string
          location_id: string | null
          mdrrmo_user_id: string
        }
        Insert: {
          access_type?: string
          accessed_at?: string
          booking_id?: string | null
          id?: string
          location_id?: string | null
          mdrrmo_user_id: string
        }
        Update: {
          access_type?: string
          accessed_at?: string
          booking_id?: string | null
          id?: string
          location_id?: string | null
          mdrrmo_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mdrrmo_access_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mdrrmo_access_logs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      paymongo_payment_events: {
        Row: {
          amount_paid: number
          booking_id: string
          created_at: string
          id: string
          paid_at: string
          provider_event_id: string | null
          provider_payment_id: string
        }
        Insert: {
          amount_paid?: number
          booking_id: string
          created_at?: string
          id?: string
          paid_at?: string
          provider_event_id?: string | null
          provider_payment_id: string
        }
        Update: {
          amount_paid?: number
          booking_id?: string
          created_at?: string
          id?: string
          paid_at?: string
          provider_event_id?: string | null
          provider_payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paymongo_payment_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
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
          is_active: boolean
          liability_waiver_at: string | null
          mdrrmo_consent_at: string | null
          mdrrmo_consent_version: string | null
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
          is_active?: boolean
          liability_waiver_at?: string | null
          mdrrmo_consent_at?: string | null
          mdrrmo_consent_version?: string | null
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
          is_active?: boolean
          liability_waiver_at?: string | null
          mdrrmo_consent_at?: string | null
          mdrrmo_consent_version?: string | null
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
          booking_id: string | null
          created_at: string
          difficulty: string | null
          id: string
          is_approved: boolean
          photo_url: string | null
          rating: number
          review_text: string
          review_type: string
          reviewer_name: string
          trail_name: string
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          difficulty?: string | null
          id?: string
          is_approved?: boolean
          photo_url?: string | null
          rating?: number
          review_text?: string
          review_type?: string
          reviewer_name?: string
          trail_name?: string
          user_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          difficulty?: string | null
          id?: string
          is_approved?: boolean
          photo_url?: string | null
          rating?: number
          review_text?: string
          review_type?: string
          reviewer_name?: string
          trail_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      trail_recordings: {
        Row: {
          cleaned_points_json: Json
          comparison_summary: Json
          created_at: string
          id: string
          location_id: string | null
          notes: string | null
          quality_summary: Json
          raw_points_json: Json
          recorded_by: string | null
          review_decision: string
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
          trail_zone_id: string | null
        }
        Insert: {
          cleaned_points_json?: Json
          comparison_summary?: Json
          created_at?: string
          id?: string
          location_id?: string | null
          notes?: string | null
          quality_summary?: Json
          raw_points_json?: Json
          recorded_by?: string | null
          review_decision?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          trail_zone_id?: string | null
        }
        Update: {
          cleaned_points_json?: Json
          comparison_summary?: Json
          created_at?: string
          id?: string
          location_id?: string | null
          notes?: string | null
          quality_summary?: Json
          raw_points_json?: Json
          recorded_by?: string | null
          review_decision?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          trail_zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trail_recordings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trail_recordings_trail_zone_id_fkey"
            columns: ["trail_zone_id"]
            isOneToOne: false
            referencedRelation: "trail_zones"
            referencedColumns: ["id"]
          },
        ]
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
          cleaned_recording_json: Json
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
          raw_recording_json: Json
          recorded_by: string | null
          recording_count: number
          recording_metadata: Json
          review_status: string
          source: string
          status: string
        }
        Insert: {
          cleaned_recording_json?: Json
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
          raw_recording_json?: Json
          recorded_by?: string | null
          recording_count?: number
          recording_metadata?: Json
          review_status?: string
          source?: string
          status?: string
        }
        Update: {
          cleaned_recording_json?: Json
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
          raw_recording_json?: Json
          recorded_by?: string | null
          recording_count?: number
          recording_metadata?: Json
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
      trailhead_slot_capacity_audit: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          location_id: string
          new_max_groups: number
          old_max_groups: number | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          location_id: string
          new_max_groups: number
          old_max_groups?: number | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          location_id?: string
          new_max_groups?: number
          old_max_groups?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trailhead_slot_capacity_audit_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      trailhead_slot_capacity_settings: {
        Row: {
          location_id: string
          max_groups: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          location_id: string
          max_groups?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          location_id?: string
          max_groups?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trailhead_slot_capacity_settings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
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
      adjust_daily_capacity_for_booking: {
        Args: {
          p_booking_date: string
          p_delta: number
          p_group_size: number
          p_hike_type: string
          p_location_id: string
        }
        Returns: undefined
      }
      admin_add_hike_guide: {
        Args: { p_booking_id: string; p_guide_id: string }
        Returns: Json
      }
      admin_approve_booking_reschedule: {
        Args: { p_approved: boolean; p_booking_id: string; p_reason?: string }
        Returns: Json
      }
      admin_assign_hike_guide: {
        Args: { p_booking_id: string; p_guide_id: string; p_trail_id?: string }
        Returns: Json
      }
      admin_available_guide_ids_for_slot: {
        Args: {
          p_booking_date: string
          p_exclude_booking_id?: string
          p_hike_time: string
          p_hike_type: string
          p_location_id: string
        }
        Returns: string[]
      }
      admin_can_access_location: {
        Args: { _location_id: string }
        Returns: boolean
      }
      admin_reassign_hike_guide: {
        Args: { p_booking_id: string; p_guide_id: string; p_reason: string }
        Returns: Json
      }
      ai_attendance_summary: {
        Args: {
          p_end_date: string
          p_location_id?: string
          p_start_date: string
        }
        Returns: Json
      }
      ai_booking_summary: {
        Args: {
          p_end_date: string
          p_location_id?: string
          p_start_date: string
        }
        Returns: Json
      }
      booking_capacity_group_limit: {
        Args: { p_location_id: string }
        Returns: number
      }
      booking_capacity_holds: { Args: { p_status: string }; Returns: boolean }
      booking_capacity_issue: {
        Args: {
          p_booking: Database["public"]["Tables"]["bookings"]["Row"]
          p_ignore_id?: string
        }
        Returns: string
      }
      booking_companion_names: {
        Args: { p_booking_id: string }
        Returns: {
          companion_index: number
          companion_name: string
        }[]
      }
      booking_effective_date: {
        Args: { p_booking: Database["public"]["Tables"]["bookings"]["Row"] }
        Returns: string
      }
      booking_effective_meta: {
        Args: { p_booking: Database["public"]["Tables"]["bookings"]["Row"] }
        Returns: Json
      }
      booking_normalize_time: { Args: { p_time: string }; Returns: string }
      booking_schedule_for_location: {
        Args: { p_location_id?: string }
        Returns: Json
      }
      booking_schedule_range: {
        Args: { p_booking_id: string }
        Returns: unknown
      }
      booking_slot_is_scheduled: {
        Args: {
          p_hike_time: string
          p_hike_type: string
          p_location_id: string
        }
        Returns: boolean
      }
      booking_validate_schedule: {
        Args: { p_schedule: Json }
        Returns: undefined
      }
      can_moderate_guide_review: {
        Args: { _booking_id: string }
        Returns: boolean
      }
      can_moderate_trail_review: {
        Args: { _booking_id: string }
        Returns: boolean
      }
      can_submit_guide_review: {
        Args: { _booking_id: string; _guide_id: string }
        Returns: boolean
      }
      claim_booking_companion: {
        Args: {
          p_companion_index: number
          p_device_id: string
          p_join_code: string
        }
        Returns: Json
      }
      claim_booking_confirmation_email: {
        Args: { _booking_id: string }
        Returns: {
          attempts: number
          booking_id: string
          created_at: string
          first_attempt_at: string | null
          last_error: string | null
          lease_until: string | null
          next_attempt_at: string
          payload: Json | null
          provider_id: string | null
          sent_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "booking_confirmation_emails"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_hike_session: {
        Args: { p_booking_id: string; p_notes: string }
        Returns: Json
      }
      create_app_notification: {
        Args: {
          p_body?: string
          p_booking_id?: string
          p_category?: string
          p_link?: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      create_staff_change_announcement: {
        Args: { p_actor: string; p_body: string; p_title: string }
        Returns: string
      }
      create_staff_change_announcement_for_location: {
        Args: {
          p_actor: string
          p_body: string
          p_location_id: string
          p_title: string
        }
        Returns: string
      }
      get_booking_capacity_control: { Args: never; Returns: Json }
      get_booking_companion_options: {
        Args: { p_join_code: string }
        Returns: {
          booking_date: string
          booking_id: string
          claimed: boolean
          companion_index: number
          companion_name: string
          group_size: number
        }[]
      }
      get_booking_slot_availability: {
        Args: {
          p_end_date: string
          p_location_id?: string
          p_start_date: string
        }
        Returns: {
          available_groups: number
          available_people: number
          booking_date: string
          group_count: number
          hike_time: string
          hike_type: string
          location_id: string
          max_groups: number
          max_people: number
          people_count: number
          using_trailheads: string[]
        }[]
      }
      get_booking_slot_capacity: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          booking_date: string
          group_count: number
          hike_time: string
          hike_type: string
          summit_hour: number
        }[]
      }
      guide_can_handover_assignment: {
        Args: {
          _booking_id: string
          _location_id: string
          _target_guide_id: string
        }
        Returns: boolean
      }
      guide_can_manage_booking: {
        Args: { _booking_id: string }
        Returns: boolean
      }
      guide_can_read_booking: {
        Args: { _booking_id: string }
        Returns: boolean
      }
      guide_has_schedule_conflict: {
        Args: {
          p_booking_id: string
          p_exclude_assignment_id?: string
          p_guide_id: string
        }
        Returns: boolean
      }
      guide_reassign_hike_assignment: {
        Args: {
          p_assignment_id: string
          p_reason: string
          p_replacement_guide_id: string
        }
        Returns: Json
      }
      guide_slot_range: {
        Args: {
          p_booking_date: string
          p_hike_time: string
          p_hike_type: string
        }
        Returns: unknown
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_account: { Args: { _user_id: string }; Returns: boolean }
      match_kb_chunks: {
        Args: {
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          category: string
          content: string
          id: string
          similarity: number
          title: string
        }[]
      }
      mdrrmo_daily_booking_directory: {
        Args: { p_date?: string; p_location_id?: string }
        Returns: {
          age: string
          booking_date: string
          booking_id: string
          contact_number: string
          group_size: number
          lead_name: string
          location_id: string
          location_name: string
          medical_notes: string
          people: Json
          sex: string
        }[]
      }
      mdrrmo_log_access: {
        Args: { p_booking_ids?: string[]; p_location_id?: string }
        Returns: number
      }
      process_paymongo_payment: {
        Args: {
          p_amount_paid: number
          p_booking_id: string
          p_paid_at?: string
          p_provider_event_id: string
          p_provider_payment_id: string
        }
        Returns: boolean
      }
      refresh_guide_duty_status: {
        Args: { p_guide_id: string }
        Returns: string
      }
      request_booking_reschedule: {
        Args: { p_booking_id: string; p_new_date: string; p_reason: string }
        Returns: Json
      }
      safe_booking_meta: { Args: { _notes: string }; Returns: Json }
      save_booking_capacity_control: {
        Args: { p_payload: Json }
        Returns: Json
      }
      session_location_id: { Args: { _session_id: string }; Returns: string }
      set_trailhead_slot_capacity: {
        Args: { p_location_id: string; p_max_groups: number }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "ranger"
        | "guide"
        | "hiker"
        | "mdrrmo"
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
    Enums: {
      app_role: ["super_admin", "admin", "ranger", "guide", "hiker", "mdrrmo"],
    },
  },
} as const
