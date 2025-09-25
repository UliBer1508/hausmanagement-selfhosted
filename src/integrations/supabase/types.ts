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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      activity_cache: {
        Row: {
          activity_type: string | null
          address: string
          coordinates: Json | null
          created_at: string | null
          description: string | null
          difficulty_level: number | null
          duration_category: string | null
          duration_minutes: number | null
          duration_text: string | null
          elevation_gain: number | null
          equipment_needed: string[] | null
          google_place_details: Json | null
          id: string
          last_travel_update: string | null
          last_updated: string | null
          last_weather_update: string | null
          main_category: string | null
          name: string
          opening_hours: Json | null
          photos: string[] | null
          place_id: string | null
          price_level: number | null
          rating: number | null
          season: string | null
          season_months: number[] | null
          seasonal_info: Json | null
          sub_category: string | null
          target_audience: string[] | null
          total_time_minutes: number | null
          travel_time_outbound_minutes: number | null
          travel_time_return_minutes: number | null
          travel_times: Json | null
          types: string[] | null
          user_ratings_total: number | null
          weather_data: Json | null
        }
        Insert: {
          activity_type?: string | null
          address: string
          coordinates?: Json | null
          created_at?: string | null
          description?: string | null
          difficulty_level?: number | null
          duration_category?: string | null
          duration_minutes?: number | null
          duration_text?: string | null
          elevation_gain?: number | null
          equipment_needed?: string[] | null
          google_place_details?: Json | null
          id?: string
          last_travel_update?: string | null
          last_updated?: string | null
          last_weather_update?: string | null
          main_category?: string | null
          name: string
          opening_hours?: Json | null
          photos?: string[] | null
          place_id?: string | null
          price_level?: number | null
          rating?: number | null
          season?: string | null
          season_months?: number[] | null
          seasonal_info?: Json | null
          sub_category?: string | null
          target_audience?: string[] | null
          total_time_minutes?: number | null
          travel_time_outbound_minutes?: number | null
          travel_time_return_minutes?: number | null
          travel_times?: Json | null
          types?: string[] | null
          user_ratings_total?: number | null
          weather_data?: Json | null
        }
        Update: {
          activity_type?: string | null
          address?: string
          coordinates?: Json | null
          created_at?: string | null
          description?: string | null
          difficulty_level?: number | null
          duration_category?: string | null
          duration_minutes?: number | null
          duration_text?: string | null
          elevation_gain?: number | null
          equipment_needed?: string[] | null
          google_place_details?: Json | null
          id?: string
          last_travel_update?: string | null
          last_updated?: string | null
          last_weather_update?: string | null
          main_category?: string | null
          name?: string
          opening_hours?: Json | null
          photos?: string[] | null
          place_id?: string | null
          price_level?: number | null
          rating?: number | null
          season?: string | null
          season_months?: number[] | null
          seasonal_info?: Json | null
          sub_category?: string | null
          target_audience?: string[] | null
          total_time_minutes?: number | null
          travel_time_outbound_minutes?: number | null
          travel_time_return_minutes?: number | null
          travel_times?: Json | null
          types?: string[] | null
          user_ratings_total?: number | null
          weather_data?: Json | null
        }
        Relationships: []
      }
      alpine_activities: {
        Row: {
          address: string
          coordinates: Json | null
          created_at: string | null
          currency: string | null
          description: string | null
          difficulty_level: number | null
          duration_category: string | null
          duration_minutes: number | null
          elevation_gain: number | null
          equipment_needed: string[] | null
          estimated_cost_max: number | null
          estimated_cost_min: number | null
          expires_at: string | null
          google_place_details: Json | null
          id: string
          last_travel_update: string | null
          last_updated: string | null
          last_weather_update: string | null
          main_category: string | null
          name: string
          opening_hours: Json | null
          photos: string[] | null
          place_id: string | null
          price_level: number | null
          rating: number | null
          region: string | null
          season: string | null
          seasonal_info: Json | null
          sub_category: string | null
          target_audience: string[] | null
          travel_times: Json | null
          types: string[] | null
          updated_at: string | null
          user_ratings_total: number | null
          weather_data: Json | null
        }
        Insert: {
          address: string
          coordinates?: Json | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          difficulty_level?: number | null
          duration_category?: string | null
          duration_minutes?: number | null
          elevation_gain?: number | null
          equipment_needed?: string[] | null
          estimated_cost_max?: number | null
          estimated_cost_min?: number | null
          expires_at?: string | null
          google_place_details?: Json | null
          id?: string
          last_travel_update?: string | null
          last_updated?: string | null
          last_weather_update?: string | null
          main_category?: string | null
          name: string
          opening_hours?: Json | null
          photos?: string[] | null
          place_id?: string | null
          price_level?: number | null
          rating?: number | null
          region?: string | null
          season?: string | null
          seasonal_info?: Json | null
          sub_category?: string | null
          target_audience?: string[] | null
          travel_times?: Json | null
          types?: string[] | null
          updated_at?: string | null
          user_ratings_total?: number | null
          weather_data?: Json | null
        }
        Update: {
          address?: string
          coordinates?: Json | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          difficulty_level?: number | null
          duration_category?: string | null
          duration_minutes?: number | null
          elevation_gain?: number | null
          equipment_needed?: string[] | null
          estimated_cost_max?: number | null
          estimated_cost_min?: number | null
          expires_at?: string | null
          google_place_details?: Json | null
          id?: string
          last_travel_update?: string | null
          last_updated?: string | null
          last_weather_update?: string | null
          main_category?: string | null
          name?: string
          opening_hours?: Json | null
          photos?: string[] | null
          place_id?: string | null
          price_level?: number | null
          rating?: number | null
          region?: string | null
          season?: string | null
          seasonal_info?: Json | null
          sub_category?: string | null
          target_audience?: string[] | null
          travel_times?: Json | null
          types?: string[] | null
          updated_at?: string | null
          user_ratings_total?: number | null
          weather_data?: Json | null
        }
        Relationships: []
      }
      blocked_bookings: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          booking_id: string
          reason: string
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          booking_id: string
          reason: string
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          booking_id?: string
          reason?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          booking_amount: number | null
          check_in: string
          check_out: string
          created_at: string | null
          currency: string | null
          external_booking_id: string | null
          external_id: string | null
          guest_email: string | null
          guest_name: string
          guest_phone: string | null
          house_id: string
          id: string
          import_platform: string | null
          nationality: string | null
          notes: string | null
          number_of_guests: number
          platform: string | null
          source: string | null
          status: Database["public"]["Enums"]["booking_status"] | null
          updated_at: string | null
        }
        Insert: {
          booking_amount?: number | null
          check_in: string
          check_out: string
          created_at?: string | null
          currency?: string | null
          external_booking_id?: string | null
          external_id?: string | null
          guest_email?: string | null
          guest_name: string
          guest_phone?: string | null
          house_id: string
          id?: string
          import_platform?: string | null
          nationality?: string | null
          notes?: string | null
          number_of_guests: number
          platform?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          updated_at?: string | null
        }
        Update: {
          booking_amount?: number | null
          check_in?: string
          check_out?: string
          created_at?: string | null
          currency?: string | null
          external_booking_id?: string | null
          external_id?: string | null
          guest_email?: string | null
          guest_name?: string
          guest_phone?: string | null
          house_id?: string
          id?: string
          import_platform?: string | null
          nationality?: string | null
          notes?: string | null
          number_of_guests?: number
          platform?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_assignments: {
        Row: {
          actual_duration: number | null
          assigned_at: string | null
          cleaning_staff_id: string | null
          completed_at: string | null
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string | null
          estimated_duration: number | null
          id: string
          service_task_id: string | null
          special_instructions: string | null
          started_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          actual_duration?: number | null
          assigned_at?: string | null
          cleaning_staff_id?: string | null
          completed_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          estimated_duration?: number | null
          id?: string
          service_task_id?: string | null
          special_instructions?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_duration?: number | null
          assigned_at?: string | null
          cleaning_staff_id?: string | null
          completed_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          estimated_duration?: number | null
          id?: string
          service_task_id?: string | null
          special_instructions?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_assignments_cleaning_staff_id_fkey"
            columns: ["cleaning_staff_id"]
            isOneToOne: false
            referencedRelation: "cleaning_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_assignments_service_task_id_fkey"
            columns: ["service_task_id"]
            isOneToOne: false
            referencedRelation: "service_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_confirmations: {
        Row: {
          cleaning_assignment_id: string | null
          completion_notes: string | null
          created_at: string | null
          id: string
          issues_reported: string | null
          photo_urls: string[] | null
          quality_rating: number | null
        }
        Insert: {
          cleaning_assignment_id?: string | null
          completion_notes?: string | null
          created_at?: string | null
          id?: string
          issues_reported?: string | null
          photo_urls?: string[] | null
          quality_rating?: number | null
        }
        Update: {
          cleaning_assignment_id?: string | null
          completion_notes?: string | null
          created_at?: string | null
          id?: string
          issues_reported?: string | null
          photo_urls?: string[] | null
          quality_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_confirmations_cleaning_assignment_id_fkey"
            columns: ["cleaning_assignment_id"]
            isOneToOne: false
            referencedRelation: "cleaning_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_settings: {
        Row: {
          created_at: string | null
          id: string
          suggestion_period_days: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          suggestion_period_days?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          suggestion_period_days?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      cleaning_staff: {
        Row: {
          address: string | null
          availability_days: string[] | null
          completed_assignments: number | null
          created_at: string | null
          email: string
          hourly_rate: number | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          phone: string | null
          quality_rating: number | null
          service_provider_id: string | null
          total_assignments: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          availability_days?: string[] | null
          completed_assignments?: number | null
          created_at?: string | null
          email: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          quality_rating?: number | null
          service_provider_id?: string | null
          total_assignments?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          availability_days?: string[] | null
          completed_assignments?: number | null
          created_at?: string | null
          email?: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          quality_rating?: number | null
          service_provider_id?: string | null
          total_assignments?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_staff_service_provider_id_fkey"
            columns: ["service_provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_job_logs: {
        Row: {
          activities_added: number | null
          duration_seconds: number | null
          error_message: string | null
          executed_at: string | null
          id: string
          job_name: string
          status: string | null
        }
        Insert: {
          activities_added?: number | null
          duration_seconds?: number | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          job_name: string
          status?: string | null
        }
        Update: {
          activities_added?: number | null
          duration_seconds?: number | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          job_name?: string
          status?: string | null
        }
        Relationships: []
      }
      day_trips: {
        Row: {
          activity_address: string
          activity_cache_id: string | null
          activity_name: string
          activity_type: string
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          last_data_refresh: string | null
          planned_duration: unknown | null
          rating: number | null
          route_cache_id: string | null
          travel_time_from: unknown | null
          travel_time_to: unknown | null
          trip_date: string
          trip_plan_id: string | null
          updated_at: string | null
          weather_cache_id: string | null
        }
        Insert: {
          activity_address: string
          activity_cache_id?: string | null
          activity_name: string
          activity_type: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          last_data_refresh?: string | null
          planned_duration?: unknown | null
          rating?: number | null
          route_cache_id?: string | null
          travel_time_from?: unknown | null
          travel_time_to?: unknown | null
          trip_date: string
          trip_plan_id?: string | null
          updated_at?: string | null
          weather_cache_id?: string | null
        }
        Update: {
          activity_address?: string
          activity_cache_id?: string | null
          activity_name?: string
          activity_type?: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          last_data_refresh?: string | null
          planned_duration?: unknown | null
          rating?: number | null
          route_cache_id?: string | null
          travel_time_from?: unknown | null
          travel_time_to?: unknown | null
          trip_date?: string
          trip_plan_id?: string | null
          updated_at?: string | null
          weather_cache_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "day_trips_activity_cache_id_fkey"
            columns: ["activity_cache_id"]
            isOneToOne: false
            referencedRelation: "activity_cache"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_trips_trip_plan_id_fkey"
            columns: ["trip_plan_id"]
            isOneToOne: false
            referencedRelation: "trip_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_day_trips_activity_cache"
            columns: ["activity_cache_id"]
            isOneToOne: false
            referencedRelation: "activity_cache"
            referencedColumns: ["id"]
          },
        ]
      }
      house_cleaning_instructions: {
        Row: {
          created_at: string | null
          estimated_duration: number | null
          house_id: string | null
          id: string
          instructions: string
          priority: number | null
          room_type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          estimated_duration?: number | null
          house_id?: string | null
          id?: string
          instructions: string
          priority?: number | null
          room_type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          estimated_duration?: number | null
          house_id?: string | null
          id?: string
          instructions?: string
          priority?: number | null
          room_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "house_cleaning_instructions_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      house_ical_sources: {
        Row: {
          created_at: string | null
          house_id: string
          ical_url: string
          id: string
          is_active: boolean | null
          last_import_at: string | null
          last_import_count: number | null
          name: string
          platform: string
          platform_display_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          house_id: string
          ical_url: string
          id?: string
          is_active?: boolean | null
          last_import_at?: string | null
          last_import_count?: number | null
          name: string
          platform: string
          platform_display_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          house_id?: string
          ical_url?: string
          id?: string
          is_active?: boolean | null
          last_import_at?: string | null
          last_import_count?: number | null
          name?: string
          platform?: string
          platform_display_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "house_ical_sources_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      house_inventory: {
        Row: {
          category: string
          condition: string
          created_at: string | null
          expected_quantity: number | null
          house_id: string
          id: string
          is_template: boolean | null
          last_checked: string | null
          location: string | null
          name: string
          notes: string | null
          quantity: number | null
          updated_at: string | null
        }
        Insert: {
          category: string
          condition?: string
          created_at?: string | null
          expected_quantity?: number | null
          house_id: string
          id?: string
          is_template?: boolean | null
          last_checked?: string | null
          location?: string | null
          name: string
          notes?: string | null
          quantity?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          condition?: string
          created_at?: string | null
          expected_quantity?: number | null
          house_id?: string
          id?: string
          is_template?: boolean | null
          last_checked?: string | null
          location?: string | null
          name?: string
          notes?: string | null
          quantity?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "house_inventory_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      houses: {
        Row: {
          address: string
          bathrooms: number | null
          created_at: string | null
          ical_url: string | null
          id: string
          image_filename: string | null
          image_url: string | null
          linen_dirty: Json | null
          linen_in_cleaning: Json | null
          linen_in_use: Json | null
          linen_reserved: Json | null
          linen_stock: Json | null
          max_guests: number
          name: string
          ordered_linen: Json | null
          updated_at: string | null
        }
        Insert: {
          address: string
          bathrooms?: number | null
          created_at?: string | null
          ical_url?: string | null
          id?: string
          image_filename?: string | null
          image_url?: string | null
          linen_dirty?: Json | null
          linen_in_cleaning?: Json | null
          linen_in_use?: Json | null
          linen_reserved?: Json | null
          linen_stock?: Json | null
          max_guests: number
          name: string
          ordered_linen?: Json | null
          updated_at?: string | null
        }
        Update: {
          address?: string
          bathrooms?: number | null
          created_at?: string | null
          ical_url?: string | null
          id?: string
          image_filename?: string | null
          image_url?: string | null
          linen_dirty?: Json | null
          linen_in_cleaning?: Json | null
          linen_in_use?: Json | null
          linen_reserved?: Json | null
          linen_stock?: Json | null
          max_guests?: number
          name?: string
          ordered_linen?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ical_preview_edits: {
        Row: {
          booking_id: string
          check_in: string | null
          check_out: string | null
          created_at: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          notes: string | null
          number_of_guests: number | null
          source_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          booking_id: string
          check_in?: string | null
          check_out?: string | null
          created_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          notes?: string | null
          number_of_guests?: number | null
          source_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          booking_id?: string
          check_in?: string | null
          check_out?: string | null
          created_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          notes?: string | null
          number_of_guests?: number | null
          source_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ical_preview_edits_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "house_ical_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      laundry_confirmations: {
        Row: {
          completion_notes: string | null
          created_at: string | null
          id: string
          issues_reported: string | null
          laundry_order_id: string | null
          photo_urls: string[] | null
          quality_rating: number | null
        }
        Insert: {
          completion_notes?: string | null
          created_at?: string | null
          id?: string
          issues_reported?: string | null
          laundry_order_id?: string | null
          photo_urls?: string[] | null
          quality_rating?: number | null
        }
        Update: {
          completion_notes?: string | null
          created_at?: string | null
          id?: string
          issues_reported?: string | null
          laundry_order_id?: string | null
          photo_urls?: string[] | null
          quality_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "laundry_confirmations_laundry_order_id_fkey"
            columns: ["laundry_order_id"]
            isOneToOne: false
            referencedRelation: "laundry_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      laundry_order_items: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          item_name: string
          item_type: string
          laundry_order_id: string
          material: string | null
          quantity: number
          size: string | null
          special_instructions: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          item_name: string
          item_type: string
          laundry_order_id: string
          material?: string | null
          quantity?: number
          size?: string | null
          special_instructions?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          item_name?: string
          item_type?: string
          laundry_order_id?: string
          material?: string | null
          quantity?: number
          size?: string | null
          special_instructions?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "laundry_order_items_laundry_order_id_fkey"
            columns: ["laundry_order_id"]
            isOneToOne: false
            referencedRelation: "laundry_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      laundry_orders: {
        Row: {
          actual_duration: number | null
          assigned_at: string | null
          completed_at: string | null
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string | null
          delivery_date: string | null
          estimated_duration: number | null
          id: string
          laundry_staff_id: string | null
          pickup_date: string | null
          service_task_id: string | null
          special_instructions: string | null
          started_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          actual_duration?: number | null
          assigned_at?: string | null
          completed_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          delivery_date?: string | null
          estimated_duration?: number | null
          id?: string
          laundry_staff_id?: string | null
          pickup_date?: string | null
          service_task_id?: string | null
          special_instructions?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_duration?: number | null
          assigned_at?: string | null
          completed_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          delivery_date?: string | null
          estimated_duration?: number | null
          id?: string
          laundry_staff_id?: string | null
          pickup_date?: string | null
          service_task_id?: string | null
          special_instructions?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "laundry_orders_laundry_staff_id_fkey"
            columns: ["laundry_staff_id"]
            isOneToOne: false
            referencedRelation: "laundry_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_orders_service_task_id_fkey"
            columns: ["service_task_id"]
            isOneToOne: false
            referencedRelation: "service_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      laundry_staff: {
        Row: {
          address: string | null
          availability_days: string[] | null
          completed_orders: number | null
          created_at: string | null
          email: string | null
          hourly_rate: number | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          phone: string | null
          quality_rating: number | null
          service_provider_id: string | null
          total_orders: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          availability_days?: string[] | null
          completed_orders?: number | null
          created_at?: string | null
          email?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          quality_rating?: number | null
          service_provider_id?: string | null
          total_orders?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          availability_days?: string[] | null
          completed_orders?: number | null
          created_at?: string | null
          email?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          quality_rating?: number | null
          service_provider_id?: string | null
          total_orders?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "laundry_staff_service_provider_id_fkey"
            columns: ["service_provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      linen_orders: {
        Row: {
          assigned_staff_id: string | null
          booking_id: string | null
          created_at: string | null
          delivery_date: string | null
          delivery_time: string | null
          email_sent_at: string | null
          house_id: string | null
          id: string
          item_variants: Json | null
          items: Json
          notes: string | null
          order_date: string
          provider_id: string | null
          status: string | null
          total_items: number
          updated_at: string | null
        }
        Insert: {
          assigned_staff_id?: string | null
          booking_id?: string | null
          created_at?: string | null
          delivery_date?: string | null
          delivery_time?: string | null
          email_sent_at?: string | null
          house_id?: string | null
          id?: string
          item_variants?: Json | null
          items: Json
          notes?: string | null
          order_date?: string
          provider_id?: string | null
          status?: string | null
          total_items: number
          updated_at?: string | null
        }
        Update: {
          assigned_staff_id?: string | null
          booking_id?: string | null
          created_at?: string | null
          delivery_date?: string | null
          delivery_time?: string | null
          email_sent_at?: string | null
          house_id?: string | null
          id?: string
          item_variants?: Json | null
          items?: Json
          notes?: string | null
          order_date?: string
          provider_id?: string | null
          status?: string | null
          total_items?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linen_orders_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "laundry_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linen_orders_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linen_orders_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linen_orders_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      linen_requirements: {
        Row: {
          bath_mats: number | null
          bedding: number | null
          blankets: number | null
          booking_id: string
          created_at: string | null
          custom_categories: Json | null
          house_id: string
          id: string
          kitchen_towels: number | null
          large_towels: number | null
          pillow_cases: number | null
          sauna_towels: number | null
          sink_towels: number | null
          small_towels: number | null
          table_linens: number | null
          updated_at: string | null
        }
        Insert: {
          bath_mats?: number | null
          bedding?: number | null
          blankets?: number | null
          booking_id: string
          created_at?: string | null
          custom_categories?: Json | null
          house_id: string
          id?: string
          kitchen_towels?: number | null
          large_towels?: number | null
          pillow_cases?: number | null
          sauna_towels?: number | null
          sink_towels?: number | null
          small_towels?: number | null
          table_linens?: number | null
          updated_at?: string | null
        }
        Update: {
          bath_mats?: number | null
          bedding?: number | null
          blankets?: number | null
          booking_id?: string
          created_at?: string | null
          custom_categories?: Json | null
          house_id?: string
          id?: string
          kitchen_towels?: number | null
          large_towels?: number | null
          pillow_cases?: number | null
          sauna_towels?: number | null
          sink_towels?: number | null
          small_towels?: number | null
          table_linens?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linen_requirements_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linen_requirements_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      linen_set_definitions: {
        Row: {
          bath_mats_per_booking: number | null
          bedding_per_guest: number | null
          blankets_per_guest: number | null
          created_at: string | null
          custom_categories: Json | null
          house_id: string | null
          id: string
          kitchen_towels_per_booking: number | null
          large_towels_per_guest: number | null
          pillow_cases_per_guest: number | null
          sauna_towels_per_guest: number | null
          sink_towels_per_booking: number | null
          small_towels_per_guest: number | null
          table_linens_per_booking: number | null
          updated_at: string | null
        }
        Insert: {
          bath_mats_per_booking?: number | null
          bedding_per_guest?: number | null
          blankets_per_guest?: number | null
          created_at?: string | null
          custom_categories?: Json | null
          house_id?: string | null
          id?: string
          kitchen_towels_per_booking?: number | null
          large_towels_per_guest?: number | null
          pillow_cases_per_guest?: number | null
          sauna_towels_per_guest?: number | null
          sink_towels_per_booking?: number | null
          small_towels_per_guest?: number | null
          table_linens_per_booking?: number | null
          updated_at?: string | null
        }
        Update: {
          bath_mats_per_booking?: number | null
          bedding_per_guest?: number | null
          blankets_per_guest?: number | null
          created_at?: string | null
          custom_categories?: Json | null
          house_id?: string | null
          id?: string
          kitchen_towels_per_booking?: number | null
          large_towels_per_guest?: number | null
          pillow_cases_per_guest?: number | null
          sauna_towels_per_guest?: number | null
          sink_towels_per_booking?: number | null
          small_towels_per_guest?: number | null
          table_linens_per_booking?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linen_set_definitions_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      linen_transactions: {
        Row: {
          booking_id: string | null
          created_at: string | null
          house_id: string
          id: string
          linen_items: Json
          new_stock: Json | null
          notes: string | null
          previous_stock: Json | null
          transaction_type: string
          updated_at: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          house_id: string
          id?: string
          linen_items?: Json
          new_stock?: Json | null
          notes?: string | null
          previous_stock?: Json | null
          transaction_type: string
          updated_at?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          house_id?: string
          id?: string
          linen_items?: Json
          new_stock?: Json | null
          notes?: string | null
          previous_stock?: Json | null
          transaction_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linen_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linen_transactions_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          provider_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          provider_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          provider_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_tokens: {
        Row: {
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          notes: string | null
          provider_id: string
          token_hash: string
          token_preview: string
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          notes?: string | null
          provider_id: string
          token_hash: string
          token_preview: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          notes?: string | null
          provider_id?: string
          token_hash?: string
          token_preview?: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_tokens_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      route_cache: {
        Row: {
          created_at: string | null
          destination_coordinates: Json
          distance_km: number | null
          duration_minutes: number | null
          expires_at: string
          id: string
          last_updated: string | null
          origin_coordinates: Json
          travel_data: Json
        }
        Insert: {
          created_at?: string | null
          destination_coordinates: Json
          distance_km?: number | null
          duration_minutes?: number | null
          expires_at: string
          id?: string
          last_updated?: string | null
          origin_coordinates: Json
          travel_data: Json
        }
        Update: {
          created_at?: string | null
          destination_coordinates?: Json
          distance_km?: number | null
          duration_minutes?: number | null
          expires_at?: string
          id?: string
          last_updated?: string | null
          origin_coordinates?: Json
          travel_data?: Json
        }
        Relationships: []
      }
      saved_places: {
        Row: {
          address: string | null
          created_at: string | null
          id: string
          name: string
          notes: string | null
          photos: string[] | null
          place_id: string
          place_type: string | null
          price_level: number | null
          rating: number | null
          tags: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          id?: string
          name: string
          notes?: string | null
          photos?: string[] | null
          place_id: string
          place_type?: string | null
          price_level?: number | null
          rating?: number | null
          tags?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          photos?: string[] | null
          place_id?: string
          place_type?: string | null
          price_level?: number | null
          rating?: number | null
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      service_providers: {
        Row: {
          alias: string | null
          contact_email: string | null
          contact_info: Json | null
          contact_phone: string | null
          created_at: string | null
          has_portal: boolean | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          portal_created_at: string | null
          portal_token: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          service_types: string[] | null
          updated_at: string | null
        }
        Insert: {
          alias?: string | null
          contact_email?: string | null
          contact_info?: Json | null
          contact_phone?: string | null
          created_at?: string | null
          has_portal?: boolean | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          portal_created_at?: string | null
          portal_token?: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          service_types?: string[] | null
          updated_at?: string | null
        }
        Update: {
          alias?: string | null
          contact_email?: string | null
          contact_info?: Json | null
          contact_phone?: string | null
          created_at?: string | null
          has_portal?: boolean | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          portal_created_at?: string | null
          portal_token?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          service_types?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      service_tasks: {
        Row: {
          assigned_staff_id: string | null
          booking_id: string | null
          completed_at: string | null
          created_at: string | null
          house_id: string
          id: string
          notes: string | null
          provider_id: string | null
          scheduled_date: string
          scheduled_time: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          status: Database["public"]["Enums"]["task_status"] | null
          updated_at: string | null
        }
        Insert: {
          assigned_staff_id?: string | null
          booking_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          house_id: string
          id?: string
          notes?: string | null
          provider_id?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          service_type: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["task_status"] | null
          updated_at?: string | null
        }
        Update: {
          assigned_staff_id?: string | null
          booking_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          house_id?: string
          id?: string
          notes?: string | null
          provider_id?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          service_type?: Database["public"]["Enums"]["service_type"]
          status?: Database["public"]["Enums"]["task_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_tasks_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_tasks_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_activities: {
        Row: {
          activity_date: string
          booking_reference: string | null
          booking_status: string | null
          category: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          end_time: string | null
          estimated_cost: number | null
          id: string
          location: string | null
          notes: string | null
          place_id: string | null
          start_time: string | null
          title: string
          trip_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          activity_date: string
          booking_reference?: string | null
          booking_status?: string | null
          category?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          end_time?: string | null
          estimated_cost?: number | null
          id?: string
          location?: string | null
          notes?: string | null
          place_id?: string | null
          start_time?: string | null
          title: string
          trip_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          activity_date?: string
          booking_reference?: string | null
          booking_status?: string | null
          category?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          end_time?: string | null
          estimated_cost?: number | null
          id?: string
          location?: string | null
          notes?: string | null
          place_id?: string | null
          start_time?: string | null
          title?: string
          trip_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_activities_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "vacation_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_plans: {
        Row: {
          booking_id: string | null
          created_at: string | null
          guest_name: string
          id: string
          updated_at: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          guest_name: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          guest_name?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_plans_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
          preferences: Json | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          preferences?: Json | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          preferences?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vacation_trips: {
        Row: {
          budget: number | null
          cover_image_url: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          destination: string
          end_date: string
          id: string
          start_date: string
          status: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          budget?: number | null
          cover_image_url?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          destination: string
          end_date: string
          id?: string
          start_date: string
          status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          budget?: number | null
          cover_image_url?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          destination?: string
          end_date?: string
          id?: string
          start_date?: string
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      weather_cache: {
        Row: {
          coordinates: Json
          created_at: string | null
          expires_at: string
          forecast_data: Json | null
          id: string
          last_updated: string | null
          location_name: string
          weather_data: Json
        }
        Insert: {
          coordinates: Json
          created_at?: string | null
          expires_at: string
          forecast_data?: Json | null
          id?: string
          last_updated?: string | null
          location_name: string
          weather_data: Json
        }
        Update: {
          coordinates?: Json
          created_at?: string | null
          expires_at?: string
          forecast_data?: Json | null
          id?: string
          last_updated?: string | null
          location_name?: string
          weather_data?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_cleaning_suggestions: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      track_token_usage: {
        Args: { token_hash_param: string }
        Returns: boolean
      }
      validate_portal_token: {
        Args: { token: string }
        Returns: {
          provider_id: string
          provider_name: string
          service_type: string
        }[]
      }
      validate_provider_portal_token: {
        Args: { token_input: string }
        Returns: {
          contact_email: string
          contact_phone: string
          is_active: boolean
          provider_id: string
          provider_name: string
          service_type: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      booking_status: "confirmed" | "cancelled" | "completed" | "checked_in"
      service_type: "cleaning" | "laundry"
      task_status:
        | "scheduled"
        | "in_progress"
        | "completed"
        | "delayed"
        | "cancelled"
      user_role: "admin" | "cleaning_provider" | "laundry_provider"
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
      booking_status: ["confirmed", "cancelled", "completed", "checked_in"],
      service_type: ["cleaning", "laundry"],
      task_status: [
        "scheduled",
        "in_progress",
        "completed",
        "delayed",
        "cancelled",
      ],
      user_role: ["admin", "cleaning_provider", "laundry_provider"],
    },
  },
} as const
