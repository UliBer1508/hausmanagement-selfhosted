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
      activities: {
        Row: {
          address: string | null
          address_en: string | null
          advance_booking_hours: number | null
          age_restrictions: Json | null
          booking_required: boolean | null
          cancellation_policy: string | null
          category: string
          category_en: string | null
          coordinates: Json | null
          created_at: string | null
          currency: string | null
          description: string | null
          description_en: string | null
          difficulty_level: number | null
          duration_minutes: number | null
          enriched_data: Json | null
          enriched_data_en: Json | null
          equipment_needed: string[] | null
          group_size_max: number | null
          group_size_min: number | null
          id: string
          images: string[] | null
          is_active: boolean | null
          languages_available: string[] | null
          location: string
          location_en: string | null
          name: string
          name_en: string | null
          popularity_score: number | null
          price_max: number | null
          price_min: number | null
          provider_contact: Json | null
          provider_name: string | null
          rating: number | null
          review_count: number | null
          season_availability: string[] | null
          subcategory: string | null
          subcategory_en: string | null
          tags: string[] | null
          updated_at: string | null
          weather_dependent: boolean | null
        }
        Insert: {
          address?: string | null
          address_en?: string | null
          advance_booking_hours?: number | null
          age_restrictions?: Json | null
          booking_required?: boolean | null
          cancellation_policy?: string | null
          category: string
          category_en?: string | null
          coordinates?: Json | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          description_en?: string | null
          difficulty_level?: number | null
          duration_minutes?: number | null
          enriched_data?: Json | null
          enriched_data_en?: Json | null
          equipment_needed?: string[] | null
          group_size_max?: number | null
          group_size_min?: number | null
          id?: string
          images?: string[] | null
          is_active?: boolean | null
          languages_available?: string[] | null
          location: string
          location_en?: string | null
          name: string
          name_en?: string | null
          popularity_score?: number | null
          price_max?: number | null
          price_min?: number | null
          provider_contact?: Json | null
          provider_name?: string | null
          rating?: number | null
          review_count?: number | null
          season_availability?: string[] | null
          subcategory?: string | null
          subcategory_en?: string | null
          tags?: string[] | null
          updated_at?: string | null
          weather_dependent?: boolean | null
        }
        Update: {
          address?: string | null
          address_en?: string | null
          advance_booking_hours?: number | null
          age_restrictions?: Json | null
          booking_required?: boolean | null
          cancellation_policy?: string | null
          category?: string
          category_en?: string | null
          coordinates?: Json | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          description_en?: string | null
          difficulty_level?: number | null
          duration_minutes?: number | null
          enriched_data?: Json | null
          enriched_data_en?: Json | null
          equipment_needed?: string[] | null
          group_size_max?: number | null
          group_size_min?: number | null
          id?: string
          images?: string[] | null
          is_active?: boolean | null
          languages_available?: string[] | null
          location?: string
          location_en?: string | null
          name?: string
          name_en?: string | null
          popularity_score?: number | null
          price_max?: number | null
          price_min?: number | null
          provider_contact?: Json | null
          provider_name?: string | null
          rating?: number | null
          review_count?: number | null
          season_availability?: string[] | null
          subcategory?: string | null
          subcategory_en?: string | null
          tags?: string[] | null
          updated_at?: string | null
          weather_dependent?: boolean | null
        }
        Relationships: []
      }
      activity_availability: {
        Row: {
          activity_id: string
          available_spots: number
          date: string
          id: string
          is_available: boolean | null
          price: number | null
          special_conditions: string | null
          time_slot: string
        }
        Insert: {
          activity_id: string
          available_spots?: number
          date: string
          id?: string
          is_available?: boolean | null
          price?: number | null
          special_conditions?: string | null
          time_slot: string
        }
        Update: {
          activity_id?: string
          available_spots?: number
          date?: string
          id?: string
          is_available?: boolean | null
          price?: number | null
          special_conditions?: string | null
          time_slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_availability_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
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
      activity_recommendations: {
        Row: {
          activity_id: string | null
          booking_count: number | null
          booking_id: string | null
          custom_duration: number | null
          dislike_count: number | null
          expires_at: string | null
          generated_at: string | null
          guest_email: string
          id: string
          like_count: number | null
          optimal_time_slot: string | null
          personalized_description: string | null
          reasoning: Json | null
          recommendation_score: number | null
          status: string | null
          success_score: number | null
          view_count: number | null
        }
        Insert: {
          activity_id?: string | null
          booking_count?: number | null
          booking_id?: string | null
          custom_duration?: number | null
          dislike_count?: number | null
          expires_at?: string | null
          generated_at?: string | null
          guest_email: string
          id?: string
          like_count?: number | null
          optimal_time_slot?: string | null
          personalized_description?: string | null
          reasoning?: Json | null
          recommendation_score?: number | null
          status?: string | null
          success_score?: number | null
          view_count?: number | null
        }
        Update: {
          activity_id?: string | null
          booking_count?: number | null
          booking_id?: string | null
          custom_duration?: number | null
          dislike_count?: number | null
          expires_at?: string | null
          generated_at?: string | null
          guest_email?: string
          id?: string
          like_count?: number | null
          optimal_time_slot?: string | null
          personalized_description?: string | null
          reasoning?: Json | null
          recommendation_score?: number | null
          status?: string | null
          success_score?: number | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_recommendations_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "alpine_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_recommendations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_linen_settings: {
        Row: {
          created_at: string
          house_id: string
          id: string
          lookahead_bookings: number
          max_storage_ratio: number
          prices: Json
          reorder_threshold: number
          safety_buffer: number
          seasonal_factor: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          house_id: string
          id?: string
          lookahead_bookings?: number
          max_storage_ratio?: number
          prices?: Json
          reorder_threshold?: number
          safety_buffer?: number
          seasonal_factor?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          house_id?: string
          id?: string
          lookahead_bookings?: number
          max_storage_ratio?: number
          prices?: Json
          reorder_threshold?: number
          safety_buffer?: number
          seasonal_factor?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_linen_settings_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: true
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_optimization_results: {
        Row: {
          analysis_date: string | null
          booking_patterns: Json | null
          confidence_score: number | null
          created_at: string | null
          guest_behavior_insights: Json | null
          house_id: string
          id: string
          optimization_result: Json
          recommendations: Json | null
          seasonal_patterns: Json | null
        }
        Insert: {
          analysis_date?: string | null
          booking_patterns?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          guest_behavior_insights?: Json | null
          house_id: string
          id?: string
          optimization_result: Json
          recommendations?: Json | null
          seasonal_patterns?: Json | null
        }
        Update: {
          analysis_date?: string | null
          booking_patterns?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          guest_behavior_insights?: Json | null
          house_id?: string
          id?: string
          optimization_result?: Json
          recommendations?: Json | null
          seasonal_patterns?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_optimization_results_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      alpine_activities: {
        Row: {
          address: string
          coordinates: Json | null
          created_at: string | null
          currency: string | null
          description: string | null
          description_en: string | null
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
          main_category_en: string | null
          name: string
          name_en: string | null
          opening_hours: Json | null
          photos: string[] | null
          place_id: string | null
          price_level: number | null
          rating: number | null
          region: string | null
          season: string | null
          seasonal_info: Json | null
          sub_category: string | null
          sub_category_en: string | null
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
          description_en?: string | null
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
          main_category_en?: string | null
          name: string
          name_en?: string | null
          opening_hours?: Json | null
          photos?: string[] | null
          place_id?: string | null
          price_level?: number | null
          rating?: number | null
          region?: string | null
          season?: string | null
          seasonal_info?: Json | null
          sub_category?: string | null
          sub_category_en?: string | null
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
          description_en?: string | null
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
          main_category_en?: string | null
          name?: string
          name_en?: string | null
          opening_hours?: Json | null
          photos?: string[] | null
          place_id?: string | null
          price_level?: number | null
          rating?: number | null
          region?: string | null
          season?: string | null
          seasonal_info?: Json | null
          sub_category?: string | null
          sub_category_en?: string | null
          target_audience?: string[] | null
          travel_times?: Json | null
          types?: string[] | null
          updated_at?: string | null
          user_ratings_total?: number | null
          weather_data?: Json | null
        }
        Relationships: []
      }
      app_modules_config: {
        Row: {
          config_data: Json | null
          created_at: string
          display_order: number
          id: string
          is_enabled: boolean
          module_description: string | null
          module_name: string
          module_title: string
          updated_at: string
        }
        Insert: {
          config_data?: Json | null
          created_at?: string
          display_order?: number
          id?: string
          is_enabled?: boolean
          module_description?: string | null
          module_name: string
          module_title: string
          updated_at?: string
        }
        Update: {
          config_data?: Json | null
          created_at?: string
          display_order?: number
          id?: string
          is_enabled?: boolean
          module_description?: string | null
          module_name?: string
          module_title?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_reviews: {
        Row: {
          booking_id: string
          created_at: string | null
          feedback_text: string | null
          guest_email: string
          guest_name: string | null
          id: string
          preferred_language: string | null
          rating: number
          submitted_from_screen: string | null
          updated_at: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string | null
          feedback_text?: string | null
          guest_email: string
          guest_name?: string | null
          id?: string
          preferred_language?: string | null
          rating: number
          submitted_from_screen?: string | null
          updated_at?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string | null
          feedback_text?: string | null
          guest_email?: string
          guest_name?: string | null
          id?: string
          preferred_language?: string | null
          rating?: number
          submitted_from_screen?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
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
      booking_activities: {
        Row: {
          activity_id: string
          booking_id: string
          booking_reference: string | null
          created_at: string | null
          currency: string | null
          duration_minutes: number | null
          id: string
          participants: number
          rating: number | null
          review: string | null
          scheduled_date: string
          scheduled_time: string | null
          status: string | null
          total_price: number | null
          updated_at: string | null
        }
        Insert: {
          activity_id: string
          booking_id: string
          booking_reference?: string | null
          created_at?: string | null
          currency?: string | null
          duration_minutes?: number | null
          id?: string
          participants: number
          rating?: number | null
          review?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          status?: string | null
          total_price?: number | null
          updated_at?: string | null
        }
        Update: {
          activity_id?: string
          booking_id?: string
          booking_reference?: string | null
          created_at?: string | null
          currency?: string | null
          duration_minutes?: number | null
          id?: string
          participants?: number
          rating?: number | null
          review?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          status?: string | null
          total_price?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_activities_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_activities_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_card_config: {
        Row: {
          config: Json
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      booking_inquiries: {
        Row: {
          check_in: string
          check_out: string
          created_at: string | null
          guest_email: string
          guest_name: string
          guest_phone: string
          house_id: string
          id: string
          message: string | null
          number_of_guests: number
          status: string | null
          updated_at: string | null
        }
        Insert: {
          check_in: string
          check_out: string
          created_at?: string | null
          guest_email: string
          guest_name: string
          guest_phone: string
          house_id: string
          id?: string
          message?: string | null
          number_of_guests: number
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          check_in?: string
          check_out?: string
          created_at?: string | null
          guest_email?: string
          guest_name?: string
          guest_phone?: string
          house_id?: string
          id?: string
          message?: string | null
          number_of_guests?: number
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_inquiries_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_linen_config: {
        Row: {
          auto_suggest: boolean | null
          created_at: string | null
          house_id: string | null
          id: string
          lookahead_bookings: number
          updated_at: string | null
          warning_days_before: number
        }
        Insert: {
          auto_suggest?: boolean | null
          created_at?: string | null
          house_id?: string | null
          id?: string
          lookahead_bookings?: number
          updated_at?: string | null
          warning_days_before?: number
        }
        Update: {
          auto_suggest?: boolean | null
          created_at?: string | null
          house_id?: string | null
          id?: string
          lookahead_bookings?: number
          updated_at?: string | null
          warning_days_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_linen_config_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: true
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          app_identified_at: string | null
          booking_amount: number | null
          cancellation_date: string | null
          cancellation_reason: string | null
          cancelled_by: string | null
          check_in: string
          check_out: string
          created_at: string | null
          currency: string | null
          external_booking_id: string | null
          external_id: string | null
          guest_birth_date: string | null
          guest_city: string | null
          guest_contact_status: string | null
          guest_email: string | null
          guest_name: string
          guest_notes: string | null
          guest_phone: string | null
          guest_postal_code: string | null
          guest_street: string | null
          guest_travel_document: string | null
          house_id: string
          id: string
          import_platform: string | null
          nationality: string | null
          notes: string | null
          number_of_adults: number | null
          number_of_children: number | null
          number_of_guests: number
          payment_status: string | null
          platform: string | null
          source: string | null
          status: Database["public"]["Enums"]["booking_status"] | null
          updated_at: string | null
        }
        Insert: {
          app_identified_at?: string | null
          booking_amount?: number | null
          cancellation_date?: string | null
          cancellation_reason?: string | null
          cancelled_by?: string | null
          check_in: string
          check_out: string
          created_at?: string | null
          currency?: string | null
          external_booking_id?: string | null
          external_id?: string | null
          guest_birth_date?: string | null
          guest_city?: string | null
          guest_contact_status?: string | null
          guest_email?: string | null
          guest_name: string
          guest_notes?: string | null
          guest_phone?: string | null
          guest_postal_code?: string | null
          guest_street?: string | null
          guest_travel_document?: string | null
          house_id: string
          id?: string
          import_platform?: string | null
          nationality?: string | null
          notes?: string | null
          number_of_adults?: number | null
          number_of_children?: number | null
          number_of_guests: number
          payment_status?: string | null
          platform?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          updated_at?: string | null
        }
        Update: {
          app_identified_at?: string | null
          booking_amount?: number | null
          cancellation_date?: string | null
          cancellation_reason?: string | null
          cancelled_by?: string | null
          check_in?: string
          check_out?: string
          created_at?: string | null
          currency?: string | null
          external_booking_id?: string | null
          external_id?: string | null
          guest_birth_date?: string | null
          guest_city?: string | null
          guest_contact_status?: string | null
          guest_email?: string | null
          guest_name?: string
          guest_notes?: string | null
          guest_phone?: string | null
          guest_postal_code?: string | null
          guest_street?: string | null
          guest_travel_document?: string | null
          house_id?: string
          id?: string
          import_platform?: string | null
          nationality?: string | null
          notes?: string | null
          number_of_adults?: number | null
          number_of_children?: number | null
          number_of_guests?: number
          payment_status?: string | null
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
      boris_card_config: {
        Row: {
          config: Json
          created_at: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          config?: Json
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      boris_cleaning_staff: {
        Row: {
          address: string | null
          availability_days: string[]
          completed_assignments: number
          created_at: string
          email: string
          hourly_rate: number | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          quality_rating: number
          total_assignments: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          availability_days?: string[]
          completed_assignments?: number
          created_at?: string
          email: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          quality_rating?: number
          total_assignments?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          availability_days?: string[]
          completed_assignments?: number
          created_at?: string
          email?: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          quality_rating?: number
          total_assignments?: number
          updated_at?: string
        }
        Relationships: []
      }
      boris_notification_preferences: {
        Row: {
          created_at: string
          email_address: string | null
          email_notifications: boolean
          id: string
          notify_new_tasks: boolean
          notify_status_updates: boolean
          notify_task_changes: boolean
          notify_urgent_tasks: boolean
          push_notifications: boolean
          sound_notifications: boolean
          toast_notifications: boolean
          updated_at: string
          user_name: string
        }
        Insert: {
          created_at?: string
          email_address?: string | null
          email_notifications?: boolean
          id?: string
          notify_new_tasks?: boolean
          notify_status_updates?: boolean
          notify_task_changes?: boolean
          notify_urgent_tasks?: boolean
          push_notifications?: boolean
          sound_notifications?: boolean
          toast_notifications?: boolean
          updated_at?: string
          user_name?: string
        }
        Update: {
          created_at?: string
          email_address?: string | null
          email_notifications?: boolean
          id?: string
          notify_new_tasks?: boolean
          notify_status_updates?: boolean
          notify_task_changes?: boolean
          notify_urgent_tasks?: boolean
          push_notifications?: boolean
          sound_notifications?: boolean
          toast_notifications?: boolean
          updated_at?: string
          user_name?: string
        }
        Relationships: []
      }
      buffer_settings: {
        Row: {
          created_at: string
          house_id: string
          id: string
          min_buffer_stock: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          house_id: string
          id?: string
          min_buffer_stock?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          house_id?: string
          id?: string
          min_buffer_stock?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buffer_settings_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: true
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
      cleaning_automation_settings: {
        Row: {
          created_at: string | null
          default_provider_id: string | null
          default_time: string | null
          id: string
          is_enabled: boolean
          schedule_timing: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_provider_id?: string | null
          default_time?: string | null
          id?: string
          is_enabled?: boolean
          schedule_timing?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_provider_id?: string | null
          default_time?: string | null
          id?: string
          is_enabled?: boolean
          schedule_timing?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_automation_settings_default_provider_id_fkey"
            columns: ["default_provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
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
      competitor_properties: {
        Row: {
          address: string | null
          amenities: Json | null
          bathrooms: number | null
          bedrooms: number | null
          competitor_name: string
          created_at: string | null
          distance_km: number | null
          house_id: string
          id: string
          is_active: boolean | null
          max_guests: number | null
          normalized_rating: number | null
          notes: string | null
          platform: string | null
          property_name: string
          property_url: string | null
          rating: number | null
          review_count: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          amenities?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          competitor_name: string
          created_at?: string | null
          distance_km?: number | null
          house_id: string
          id?: string
          is_active?: boolean | null
          max_guests?: number | null
          normalized_rating?: number | null
          notes?: string | null
          platform?: string | null
          property_name: string
          property_url?: string | null
          rating?: number | null
          review_count?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          amenities?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          competitor_name?: string
          created_at?: string | null
          distance_km?: number | null
          house_id?: string
          id?: string
          is_active?: boolean | null
          max_guests?: number | null
          normalized_rating?: number | null
          notes?: string | null
          platform?: string | null
          property_name?: string
          property_url?: string | null
          rating?: number | null
          review_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_properties_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
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
      daily_pricing: {
        Row: {
          competitor_property_id: string | null
          created_at: string | null
          currency: string | null
          date: string
          house_id: string | null
          id: string
          is_available: boolean | null
          is_expanded: boolean | null
          min_stay: number | null
          period_check_in: string | null
          period_check_out: string | null
          period_nights: number | null
          period_total_price: number | null
          price: number
          scraped_at: string | null
          source: string | null
          updated_at: string | null
        }
        Insert: {
          competitor_property_id?: string | null
          created_at?: string | null
          currency?: string | null
          date: string
          house_id?: string | null
          id?: string
          is_available?: boolean | null
          is_expanded?: boolean | null
          min_stay?: number | null
          period_check_in?: string | null
          period_check_out?: string | null
          period_nights?: number | null
          period_total_price?: number | null
          price: number
          scraped_at?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          competitor_property_id?: string | null
          created_at?: string | null
          currency?: string | null
          date?: string
          house_id?: string | null
          id?: string
          is_available?: boolean | null
          is_expanded?: boolean | null
          min_stay?: number | null
          period_check_in?: string | null
          period_check_out?: string | null
          period_nights?: number | null
          period_total_price?: number | null
          price?: number
          scraped_at?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_pricing_competitor_property_id_fkey"
            columns: ["competitor_property_id"]
            isOneToOne: false
            referencedRelation: "competitor_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_pricing_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_pricing_backup: {
        Row: {
          competitor_property_id: string | null
          created_at: string | null
          currency: string | null
          date: string | null
          house_id: string | null
          id: string | null
          is_available: boolean | null
          is_expanded: boolean | null
          min_stay: number | null
          period_check_in: string | null
          period_check_out: string | null
          period_nights: number | null
          period_total_price: number | null
          price: number | null
          scraped_at: string | null
          source: string | null
          updated_at: string | null
        }
        Insert: {
          competitor_property_id?: string | null
          created_at?: string | null
          currency?: string | null
          date?: string | null
          house_id?: string | null
          id?: string | null
          is_available?: boolean | null
          is_expanded?: boolean | null
          min_stay?: number | null
          period_check_in?: string | null
          period_check_out?: string | null
          period_nights?: number | null
          period_total_price?: number | null
          price?: number | null
          scraped_at?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          competitor_property_id?: string | null
          created_at?: string | null
          currency?: string | null
          date?: string | null
          house_id?: string | null
          id?: string | null
          is_available?: boolean | null
          is_expanded?: boolean | null
          min_stay?: number | null
          period_check_in?: string | null
          period_check_out?: string | null
          period_nights?: number | null
          period_total_price?: number | null
          price?: number | null
          scraped_at?: string | null
          source?: string | null
          updated_at?: string | null
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
          planned_duration: unknown
          rating: number | null
          route_cache_id: string | null
          travel_time_from: unknown
          travel_time_to: unknown
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
          planned_duration?: unknown
          rating?: number | null
          route_cache_id?: string | null
          travel_time_from?: unknown
          travel_time_to?: unknown
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
          planned_duration?: unknown
          rating?: number | null
          route_cache_id?: string | null
          travel_time_from?: unknown
          travel_time_to?: unknown
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
      email_templates: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_system: boolean | null
          language: string
          name: string
          subject: string
          template_key: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_system?: boolean | null
          language?: string
          name: string
          subject: string
          template_key: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_system?: boolean | null
          language?: string
          name?: string
          subject?: string
          template_key?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      external_article_mapping: {
        Row: {
          created_at: string | null
          external_artikelnummer: string
          id: string
          internal_item_key: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          external_artikelnummer: string
          id?: string
          internal_item_key: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          external_artikelnummer?: string
          id?: string
          internal_item_key?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      guest_behavior_patterns: {
        Row: {
          avg_linen_usage: Json
          confidence_level: number | null
          created_at: string | null
          guest_type: string
          id: string
          nationality: string | null
          sample_size: number | null
          updated_at: string | null
          usage_multiplier: number | null
        }
        Insert: {
          avg_linen_usage?: Json
          confidence_level?: number | null
          created_at?: string | null
          guest_type: string
          id?: string
          nationality?: string | null
          sample_size?: number | null
          updated_at?: string | null
          usage_multiplier?: number | null
        }
        Update: {
          avg_linen_usage?: Json
          confidence_level?: number | null
          created_at?: string | null
          guest_type?: string
          id?: string
          nationality?: string | null
          sample_size?: number | null
          updated_at?: string | null
          usage_multiplier?: number | null
        }
        Relationships: []
      }
      guest_preference_responses: {
        Row: {
          booking_id: string | null
          created_at: string
          guest_email: string
          id: string
          preference_key: string
          preference_value: Json
          preferred_language: string | null
          session_id: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          guest_email: string
          id?: string
          preference_key: string
          preference_value: Json
          preferred_language?: string | null
          session_id: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          guest_email?: string
          id?: string
          preference_key?: string
          preference_value?: Json
          preferred_language?: string | null
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_preference_responses_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_preferences: {
        Row: {
          activity_level: string | null
          age_group: string | null
          booking_id: string | null
          budget_range: string | null
          confidence_score: number | null
          group_size: number | null
          group_type: string | null
          guest_email: string
          house_id: string | null
          id: string
          last_updated: string | null
          nationality: string | null
          predicted_interests: Json | null
          preferred_categories: string[] | null
          time_preference: string | null
          weather_preference: string | null
        }
        Insert: {
          activity_level?: string | null
          age_group?: string | null
          booking_id?: string | null
          budget_range?: string | null
          confidence_score?: number | null
          group_size?: number | null
          group_type?: string | null
          guest_email: string
          house_id?: string | null
          id?: string
          last_updated?: string | null
          nationality?: string | null
          predicted_interests?: Json | null
          preferred_categories?: string[] | null
          time_preference?: string | null
          weather_preference?: string | null
        }
        Update: {
          activity_level?: string | null
          age_group?: string | null
          booking_id?: string | null
          budget_range?: string | null
          confidence_score?: number | null
          group_size?: number | null
          group_type?: string | null
          guest_email?: string
          house_id?: string | null
          id?: string
          last_updated?: string | null
          nationality?: string | null
          predicted_interests?: Json | null
          preferred_categories?: string[] | null
          time_preference?: string | null
          weather_preference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_preferences_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_preferences_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_saved_activities: {
        Row: {
          activity_id: string
          booking_id: string | null
          created_at: string | null
          guest_email: string
          guest_name: string
          guest_notes: string | null
          house_id: string | null
          id: string
          scheduled_date: string
          scheduled_time: string | null
          search_language: string | null
          session_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          activity_id: string
          booking_id?: string | null
          created_at?: string | null
          guest_email: string
          guest_name: string
          guest_notes?: string | null
          house_id?: string | null
          id?: string
          scheduled_date: string
          scheduled_time?: string | null
          search_language?: string | null
          session_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          activity_id?: string
          booking_id?: string | null
          created_at?: string | null
          guest_email?: string
          guest_name?: string
          guest_notes?: string | null
          house_id?: string | null
          id?: string
          scheduled_date?: string
          scheduled_time?: string | null
          search_language?: string | null
          session_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_saved_activities_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_saved_activities_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_saved_activities_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
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
          additional_fees: Json | null
          address: string
          amenities: Json | null
          bathrooms: number | null
          bedrooms: number | null
          created_at: string | null
          default_cleaning_hours: number | null
          default_linen_color: string | null
          external_objektnummer: string | null
          ical_url: string | null
          id: string
          image_filename: string | null
          image_url: string | null
          linen_dirty: Json | null
          linen_in_cleaning: Json | null
          linen_in_use: Json | null
          linen_reserved: Json | null
          linen_stock: Json | null
          living_area_sqm: number | null
          max_guests: number
          name: string
          ordered_linen: Json | null
          own_rating: number | null
          own_rating_platform: string | null
          own_review_count: number | null
          pricing_config: Json | null
          property_type: string | null
          rental_type: string | null
          tenant_info: Json | null
          updated_at: string | null
        }
        Insert: {
          additional_fees?: Json | null
          address: string
          amenities?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          created_at?: string | null
          default_cleaning_hours?: number | null
          default_linen_color?: string | null
          external_objektnummer?: string | null
          ical_url?: string | null
          id?: string
          image_filename?: string | null
          image_url?: string | null
          linen_dirty?: Json | null
          linen_in_cleaning?: Json | null
          linen_in_use?: Json | null
          linen_reserved?: Json | null
          linen_stock?: Json | null
          living_area_sqm?: number | null
          max_guests: number
          name: string
          ordered_linen?: Json | null
          own_rating?: number | null
          own_rating_platform?: string | null
          own_review_count?: number | null
          pricing_config?: Json | null
          property_type?: string | null
          rental_type?: string | null
          tenant_info?: Json | null
          updated_at?: string | null
        }
        Update: {
          additional_fees?: Json | null
          address?: string
          amenities?: Json | null
          bathrooms?: number | null
          bedrooms?: number | null
          created_at?: string | null
          default_cleaning_hours?: number | null
          default_linen_color?: string | null
          external_objektnummer?: string | null
          ical_url?: string | null
          id?: string
          image_filename?: string | null
          image_url?: string | null
          linen_dirty?: Json | null
          linen_in_cleaning?: Json | null
          linen_in_use?: Json | null
          linen_reserved?: Json | null
          linen_stock?: Json | null
          living_area_sqm?: number | null
          max_guests?: number
          name?: string
          ordered_linen?: Json | null
          own_rating?: number | null
          own_rating_platform?: string | null
          own_review_count?: number | null
          pricing_config?: Json | null
          property_type?: string | null
          rental_type?: string | null
          tenant_info?: Json | null
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
      laundry_invoices: {
        Row: {
          bearbeitungsgebuehr: number | null
          bezahlt_am: string | null
          bruttobetrag: number
          created_at: string | null
          external_bestellung_id: string | null
          external_kunde_id: string | null
          external_rechnung_id: string
          external_updated_at: string | null
          faelligkeitsdatum: string | null
          id: string
          kunde_kundennummer: string | null
          kunde_name: string | null
          kunde_ort: string | null
          kunde_plz: string | null
          kunde_strasse: string | null
          mwst_betrag: number | null
          mwst_satz: number | null
          nettobetrag: number | null
          notes: string | null
          positionen: Json | null
          rechnungsdatum: string
          rechnungsnummer: string
          status: string | null
          synced_at: string | null
          updated_at: string | null
        }
        Insert: {
          bearbeitungsgebuehr?: number | null
          bezahlt_am?: string | null
          bruttobetrag: number
          created_at?: string | null
          external_bestellung_id?: string | null
          external_kunde_id?: string | null
          external_rechnung_id: string
          external_updated_at?: string | null
          faelligkeitsdatum?: string | null
          id?: string
          kunde_kundennummer?: string | null
          kunde_name?: string | null
          kunde_ort?: string | null
          kunde_plz?: string | null
          kunde_strasse?: string | null
          mwst_betrag?: number | null
          mwst_satz?: number | null
          nettobetrag?: number | null
          notes?: string | null
          positionen?: Json | null
          rechnungsdatum: string
          rechnungsnummer: string
          status?: string | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Update: {
          bearbeitungsgebuehr?: number | null
          bezahlt_am?: string | null
          bruttobetrag?: number
          created_at?: string | null
          external_bestellung_id?: string | null
          external_kunde_id?: string | null
          external_rechnung_id?: string
          external_updated_at?: string | null
          faelligkeitsdatum?: string | null
          id?: string
          kunde_kundennummer?: string | null
          kunde_name?: string | null
          kunde_ort?: string | null
          kunde_plz?: string | null
          kunde_strasse?: string | null
          mwst_betrag?: number | null
          mwst_satz?: number | null
          nettobetrag?: number | null
          notes?: string | null
          positionen?: Json | null
          rechnungsdatum?: string
          rechnungsnummer?: string
          status?: string | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
      linen_automation_settings: {
        Row: {
          created_at: string | null
          default_provider_id: string | null
          delivery_advance_days: number
          delivery_timing: string | null
          external_api_url: string | null
          external_kundennummer: string | null
          external_sync_enabled: boolean | null
          id: string
          is_enabled: boolean
          lookahead_bookings: number
          min_advance_days: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_provider_id?: string | null
          delivery_advance_days?: number
          delivery_timing?: string | null
          external_api_url?: string | null
          external_kundennummer?: string | null
          external_sync_enabled?: boolean | null
          id?: string
          is_enabled?: boolean
          lookahead_bookings?: number
          min_advance_days?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_provider_id?: string | null
          delivery_advance_days?: number
          delivery_timing?: string | null
          external_api_url?: string | null
          external_kundennummer?: string | null
          external_sync_enabled?: boolean | null
          id?: string
          is_enabled?: boolean
          lookahead_bookings?: number
          min_advance_days?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linen_automation_settings_default_provider_id_fkey"
            columns: ["default_provider_id"]
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
          delivery_type: string
          email_sent_at: string | null
          external_bestellnummer: string | null
          external_synced_at: string | null
          house_id: string | null
          id: string
          item_variants: Json | null
          items: Json
          linen_color: string | null
          notes: string | null
          order_date: string
          order_source: string | null
          provider_id: string | null
          status: string | null
          suggested_at: string | null
          total_items: number
          updated_at: string | null
        }
        Insert: {
          assigned_staff_id?: string | null
          booking_id?: string | null
          created_at?: string | null
          delivery_date?: string | null
          delivery_time?: string | null
          delivery_type?: string
          email_sent_at?: string | null
          external_bestellnummer?: string | null
          external_synced_at?: string | null
          house_id?: string | null
          id?: string
          item_variants?: Json | null
          items: Json
          linen_color?: string | null
          notes?: string | null
          order_date?: string
          order_source?: string | null
          provider_id?: string | null
          status?: string | null
          suggested_at?: string | null
          total_items: number
          updated_at?: string | null
        }
        Update: {
          assigned_staff_id?: string | null
          booking_id?: string | null
          created_at?: string | null
          delivery_date?: string | null
          delivery_time?: string | null
          delivery_type?: string
          email_sent_at?: string | null
          external_bestellnummer?: string | null
          external_synced_at?: string | null
          house_id?: string | null
          id?: string
          item_variants?: Json | null
          items?: Json
          linen_color?: string | null
          notes?: string | null
          order_date?: string
          order_source?: string | null
          provider_id?: string | null
          status?: string | null
          suggested_at?: string | null
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
      linen_usage_history: {
        Row: {
          actual_usage: Json
          booking_id: string | null
          created_at: string | null
          date: string
          duration_days: number
          guest_type: string | null
          house_id: string
          id: string
          number_of_guests: number
          predicted_usage: Json | null
          season: string | null
          weather_condition: string | null
        }
        Insert: {
          actual_usage?: Json
          booking_id?: string | null
          created_at?: string | null
          date: string
          duration_days: number
          guest_type?: string | null
          house_id: string
          id?: string
          number_of_guests: number
          predicted_usage?: Json | null
          season?: string | null
          weather_condition?: string | null
        }
        Update: {
          actual_usage?: Json
          booking_id?: string | null
          created_at?: string | null
          date?: string
          duration_days?: number
          guest_type?: string | null
          house_id?: string
          id?: string
          number_of_guests?: number
          predicted_usage?: Json | null
          season?: string | null
          weather_condition?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linen_usage_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linen_usage_history_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      model_parameters: {
        Row: {
          booking_pattern_influence: number | null
          created_at: string | null
          guest_type_multipliers: Json | null
          house_id: string | null
          id: string
          is_active: boolean | null
          learning_rate: number | null
          parameter_set_name: string
          parameters: Json
          performance_score: number | null
          seasonal_weights: Json | null
          updated_at: string | null
          weather_impact_factor: number | null
        }
        Insert: {
          booking_pattern_influence?: number | null
          created_at?: string | null
          guest_type_multipliers?: Json | null
          house_id?: string | null
          id?: string
          is_active?: boolean | null
          learning_rate?: number | null
          parameter_set_name: string
          parameters?: Json
          performance_score?: number | null
          seasonal_weights?: Json | null
          updated_at?: string | null
          weather_impact_factor?: number | null
        }
        Update: {
          booking_pattern_influence?: number | null
          created_at?: string | null
          guest_type_multipliers?: Json | null
          house_id?: string | null
          id?: string
          is_active?: boolean | null
          learning_rate?: number | null
          parameter_set_name?: string
          parameters?: Json
          performance_score?: number | null
          seasonal_weights?: Json | null
          updated_at?: string | null
          weather_impact_factor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "model_parameters_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_pricing: {
        Row: {
          base_price_7nights: number | null
          check_in_date: string
          check_out_date: string
          competitor_property_id: string | null
          created_at: string
          currency: string
          final_price_7nights: number | null
          house_id: string | null
          id: string
          markup_percentage: number | null
          scraped_at: string | null
          source: string
          updated_at: string
        }
        Insert: {
          base_price_7nights?: number | null
          check_in_date: string
          check_out_date: string
          competitor_property_id?: string | null
          created_at?: string
          currency?: string
          final_price_7nights?: number | null
          house_id?: string | null
          id?: string
          markup_percentage?: number | null
          scraped_at?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          base_price_7nights?: number | null
          check_in_date?: string
          check_out_date?: string
          competitor_property_id?: string | null
          created_at?: string
          currency?: string
          final_price_7nights?: number | null
          house_id?: string | null
          id?: string
          markup_percentage?: number | null
          scraped_at?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_pricing_competitor_property_id_fkey"
            columns: ["competitor_property_id"]
            isOneToOne: false
            referencedRelation: "competitor_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_pricing_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_address: string | null
          email_notifications: boolean
          id: string
          notify_new_tasks: boolean
          notify_status_updates: boolean
          notify_task_changes: boolean
          notify_urgent_tasks: boolean
          push_notifications: boolean
          sound_notifications: boolean
          toast_notifications: boolean
          updated_at: string
          user_name: string
        }
        Insert: {
          created_at?: string
          email_address?: string | null
          email_notifications?: boolean
          id?: string
          notify_new_tasks?: boolean
          notify_status_updates?: boolean
          notify_task_changes?: boolean
          notify_urgent_tasks?: boolean
          push_notifications?: boolean
          sound_notifications?: boolean
          toast_notifications?: boolean
          updated_at?: string
          user_name?: string
        }
        Update: {
          created_at?: string
          email_address?: string | null
          email_notifications?: boolean
          id?: string
          notify_new_tasks?: boolean
          notify_status_updates?: boolean
          notify_task_changes?: boolean
          notify_urgent_tasks?: boolean
          push_notifications?: boolean
          sound_notifications?: boolean
          toast_notifications?: boolean
          updated_at?: string
          user_name?: string
        }
        Relationships: []
      }
      optimization_feedback: {
        Row: {
          actual_order: Json | null
          comments: string | null
          created_at: string | null
          created_by: string | null
          feedback_type: string
          house_id: string
          id: string
          optimization_result_id: string | null
          rating: number | null
        }
        Insert: {
          actual_order?: Json | null
          comments?: string | null
          created_at?: string | null
          created_by?: string | null
          feedback_type: string
          house_id: string
          id?: string
          optimization_result_id?: string | null
          rating?: number | null
        }
        Update: {
          actual_order?: Json | null
          comments?: string | null
          created_at?: string | null
          created_by?: string | null
          feedback_type?: string
          house_id?: string
          id?: string
          optimization_result_id?: string | null
          rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "optimization_feedback_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "optimization_feedback_optimization_result_id_fkey"
            columns: ["optimization_result_id"]
            isOneToOne: false
            referencedRelation: "ai_optimization_results"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_accuracy: {
        Row: {
          accuracy_score: number | null
          actual_date: string | null
          actual_values: Json | null
          created_at: string | null
          house_id: string
          id: string
          mae: number | null
          model_version: string | null
          parameters_used: Json | null
          predicted_values: Json
          prediction_date: string
          rmse: number | null
        }
        Insert: {
          accuracy_score?: number | null
          actual_date?: string | null
          actual_values?: Json | null
          created_at?: string | null
          house_id: string
          id?: string
          mae?: number | null
          model_version?: string | null
          parameters_used?: Json | null
          predicted_values: Json
          prediction_date: string
          rmse?: number | null
        }
        Update: {
          accuracy_score?: number | null
          actual_date?: string | null
          actual_values?: Json | null
          created_at?: string | null
          house_id?: string
          id?: string
          mae?: number | null
          model_version?: string | null
          parameters_used?: Json | null
          predicted_values?: Json
          prediction_date?: string
          rmse?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prediction_accuracy_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      preference_configuration: {
        Row: {
          category_key: string | null
          conditional_logic: Json | null
          created_at: string | null
          dependency_rules: Json | null
          display_order: number | null
          id: string
          input_type: string | null
          is_enabled: boolean | null
          is_sub_question: boolean | null
          options: Json | null
          options_en: Json | null
          parent_id: string | null
          question_description: string | null
          question_text: string | null
          question_text_en: string | null
          required: boolean | null
          search_strategy: Json | null
          special_interests_mapping: Json | null
          step_name: string
          updated_at: string | null
          usage_context: string | null
          validation_rules: Json | null
          weight: number | null
        }
        Insert: {
          category_key?: string | null
          conditional_logic?: Json | null
          created_at?: string | null
          dependency_rules?: Json | null
          display_order?: number | null
          id?: string
          input_type?: string | null
          is_enabled?: boolean | null
          is_sub_question?: boolean | null
          options?: Json | null
          options_en?: Json | null
          parent_id?: string | null
          question_description?: string | null
          question_text?: string | null
          question_text_en?: string | null
          required?: boolean | null
          search_strategy?: Json | null
          special_interests_mapping?: Json | null
          step_name: string
          updated_at?: string | null
          usage_context?: string | null
          validation_rules?: Json | null
          weight?: number | null
        }
        Update: {
          category_key?: string | null
          conditional_logic?: Json | null
          created_at?: string | null
          dependency_rules?: Json | null
          display_order?: number | null
          id?: string
          input_type?: string | null
          is_enabled?: boolean | null
          is_sub_question?: boolean | null
          options?: Json | null
          options_en?: Json | null
          parent_id?: string | null
          question_description?: string | null
          question_text?: string | null
          question_text_en?: string | null
          required?: boolean | null
          search_strategy?: Json | null
          special_interests_mapping?: Json | null
          step_name?: string
          updated_at?: string | null
          usage_context?: string | null
          validation_rules?: Json | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_configuration_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "preference_configuration"
            referencedColumns: ["id"]
          },
        ]
      }
      price_comparison_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          date_range_end: string | null
          date_range_start: string | null
          house_id: string
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          message: string | null
          threshold_percentage: number | null
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          house_id: string
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          message?: string | null
          threshold_percentage?: number | null
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          house_id?: string
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          message?: string | null
          threshold_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "price_comparison_alerts_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      price_scraping_config: {
        Row: {
          competitor_property_id: string
          created_at: string | null
          error_count: number | null
          id: string
          is_active: boolean | null
          last_error: string | null
          last_scraped_at: string | null
          next_scrape_at: string | null
          scraping_frequency: string | null
          scraping_method: string | null
          scraping_params: Json | null
          updated_at: string | null
        }
        Insert: {
          competitor_property_id: string
          created_at?: string | null
          error_count?: number | null
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_scraped_at?: string | null
          next_scrape_at?: string | null
          scraping_frequency?: string | null
          scraping_method?: string | null
          scraping_params?: Json | null
          updated_at?: string | null
        }
        Update: {
          competitor_property_id?: string
          created_at?: string | null
          error_count?: number | null
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_scraped_at?: string | null
          next_scrape_at?: string | null
          scraping_frequency?: string | null
          scraping_method?: string | null
          scraping_params?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_scraping_config_competitor_property_id_fkey"
            columns: ["competitor_property_id"]
            isOneToOne: false
            referencedRelation: "competitor_properties"
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
      provider_messages: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          provider_id: string
          related_linen_order_id: string | null
          related_task_id: string | null
          sender_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          provider_id: string
          related_linen_order_id?: string | null
          related_task_id?: string | null
          sender_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          provider_id?: string
          related_linen_order_id?: string | null
          related_task_id?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_messages_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_messages_related_linen_order_id_fkey"
            columns: ["related_linen_order_id"]
            isOneToOne: false
            referencedRelation: "linen_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_messages_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "service_tasks"
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
      recommendation_feedback: {
        Row: {
          booking_id: string | null
          created_at: string | null
          feedback_type: string
          guest_email: string
          id: string
          notes: string | null
          recommendation_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          feedback_type: string
          guest_email: string
          id?: string
          notes?: string | null
          recommendation_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          feedback_type?: string
          guest_email?: string
          id?: string
          notes?: string | null
          recommendation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_feedback_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_feedback_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "activity_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_metrics: {
        Row: {
          avg_recommendation_score: number | null
          conversion_rate: number | null
          created_at: string | null
          date: string
          id: string
          total_bookings: number | null
          total_dislikes: number | null
          total_likes: number | null
          total_recommendations: number | null
          total_views: number | null
          updated_at: string | null
        }
        Insert: {
          avg_recommendation_score?: number | null
          conversion_rate?: number | null
          created_at?: string | null
          date?: string
          id?: string
          total_bookings?: number | null
          total_dislikes?: number | null
          total_likes?: number | null
          total_recommendations?: number | null
          total_views?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_recommendation_score?: number | null
          conversion_rate?: number | null
          created_at?: string | null
          date?: string
          id?: string
          total_bookings?: number | null
          total_dislikes?: number | null
          total_likes?: number | null
          total_recommendations?: number | null
          total_views?: number | null
          updated_at?: string | null
        }
        Relationships: []
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
      saved_trip_plans: {
        Row: {
          access_token: string
          booking_id: string | null
          created_at: string
          guest_email: string
          guest_name: string | null
          id: string
          is_favorite: boolean | null
          plan_data: Json
          plan_name: string
          preferences: Json | null
          region: string
          start_location: string
          trip_date: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string
          booking_id?: string | null
          created_at?: string
          guest_email: string
          guest_name?: string | null
          id?: string
          is_favorite?: boolean | null
          plan_data: Json
          plan_name: string
          preferences?: Json | null
          region: string
          start_location: string
          trip_date?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          booking_id?: string | null
          created_at?: string
          guest_email?: string
          guest_name?: string | null
          id?: string
          is_favorite?: boolean | null
          plan_data?: Json
          plan_name?: string
          preferences?: Json | null
          region?: string
          start_location?: string
          trip_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      search_algorithm_config: {
        Row: {
          algorithm_name: string
          categories: Json | null
          config_data: Json | null
          created_at: string | null
          data_source: string
          description: string | null
          display_name: string
          id: string
          is_enabled: boolean
          last_run_duration_seconds: number | null
          last_used: string | null
          success_rate: number | null
          total_activities_found: number | null
          updated_at: string | null
        }
        Insert: {
          algorithm_name: string
          categories?: Json | null
          config_data?: Json | null
          created_at?: string | null
          data_source: string
          description?: string | null
          display_name: string
          id?: string
          is_enabled?: boolean
          last_run_duration_seconds?: number | null
          last_used?: string | null
          success_rate?: number | null
          total_activities_found?: number | null
          updated_at?: string | null
        }
        Update: {
          algorithm_name?: string
          categories?: Json | null
          config_data?: Json | null
          created_at?: string | null
          data_source?: string
          description?: string | null
          display_name?: string
          id?: string
          is_enabled?: boolean
          last_run_duration_seconds?: number | null
          last_used?: string | null
          success_rate?: number | null
          total_activities_found?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      seasonal_adjustments: {
        Row: {
          adjustment_factors: Json
          based_on_samples: number | null
          confidence_score: number | null
          created_at: string | null
          house_id: string | null
          id: string
          last_calculated: string | null
          month: number | null
          season: string
          updated_at: string | null
        }
        Insert: {
          adjustment_factors?: Json
          based_on_samples?: number | null
          confidence_score?: number | null
          created_at?: string | null
          house_id?: string | null
          id?: string
          last_calculated?: string | null
          month?: number | null
          season: string
          updated_at?: string | null
        }
        Update: {
          adjustment_factors?: Json
          based_on_samples?: number | null
          confidence_score?: number | null
          created_at?: string | null
          house_id?: string | null
          id?: string
          last_calculated?: string | null
          month?: number | null
          season?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seasonal_adjustments_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
      service_providers: {
        Row: {
          alias: string | null
          contact_email: string | null
          contact_info: Json | null
          contact_phone: string | null
          created_at: string | null
          has_portal: boolean | null
          hourly_rate: number | null
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
          hourly_rate?: number | null
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
          hourly_rate?: number | null
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
          cleaning_cost: number | null
          cleaning_hours: number | null
          completed_at: string | null
          created_at: string | null
          house_id: string
          id: string
          notes: string | null
          payment_status: string | null
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
          cleaning_cost?: number | null
          cleaning_hours?: number | null
          completed_at?: string | null
          created_at?: string | null
          house_id: string
          id?: string
          notes?: string | null
          payment_status?: string | null
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
          cleaning_cost?: number | null
          cleaning_hours?: number | null
          completed_at?: string | null
          created_at?: string | null
          house_id?: string
          id?: string
          notes?: string | null
          payment_status?: string | null
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
      system_settings: {
        Row: {
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      tenant_payments: {
        Row: {
          amount: number
          created_at: string | null
          due_date: string
          house_id: string
          id: string
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          receipt_url: string | null
          reference_number: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          due_date: string
          house_id: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          reference_number?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          due_date?: string
          house_id?: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          reference_number?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payments_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
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
      usage_reports: {
        Row: {
          created_at: string | null
          database_size_mb: number | null
          edge_function_calls_estimated: number | null
          email_sent: boolean | null
          email_sent_at: string | null
          id: string
          recommendation: string | null
          report_date: string | null
          storage_size_mb: number | null
          total_rows: number | null
          urgency: string | null
        }
        Insert: {
          created_at?: string | null
          database_size_mb?: number | null
          edge_function_calls_estimated?: number | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          recommendation?: string | null
          report_date?: string | null
          storage_size_mb?: number | null
          total_rows?: number | null
          urgency?: string | null
        }
        Update: {
          created_at?: string | null
          database_size_mb?: number | null
          edge_function_calls_estimated?: number | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          recommendation?: string | null
          report_date?: string | null
          storage_size_mb?: number | null
          total_rows?: number | null
          urgency?: string | null
        }
        Relationships: []
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
      user_view_settings: {
        Row: {
          created_at: string
          id: string
          show_accommodation_address: boolean
          show_accommodation_name: boolean
          show_assigned_staff: boolean
          show_booking_status: boolean
          show_button_on_mobile: boolean
          show_check_in_date: boolean
          show_check_out_date: boolean
          show_delivery_date: boolean
          show_delivery_time: boolean
          show_delivery_type: boolean
          show_guest_count: boolean
          show_guest_name: boolean
          show_linen_orders: boolean
          show_order_items: boolean
          show_order_notes: boolean
          show_order_status: boolean
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          show_accommodation_address?: boolean
          show_accommodation_name?: boolean
          show_assigned_staff?: boolean
          show_booking_status?: boolean
          show_button_on_mobile?: boolean
          show_check_in_date?: boolean
          show_check_out_date?: boolean
          show_delivery_date?: boolean
          show_delivery_time?: boolean
          show_delivery_type?: boolean
          show_guest_count?: boolean
          show_guest_name?: boolean
          show_linen_orders?: boolean
          show_order_items?: boolean
          show_order_notes?: boolean
          show_order_status?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          show_accommodation_address?: boolean
          show_accommodation_name?: boolean
          show_assigned_staff?: boolean
          show_booking_status?: boolean
          show_button_on_mobile?: boolean
          show_check_in_date?: boolean
          show_check_out_date?: boolean
          show_delivery_date?: boolean
          show_delivery_time?: boolean
          show_delivery_type?: boolean
          show_guest_count?: boolean
          show_guest_name?: boolean
          show_linen_orders?: boolean
          show_order_items?: boolean
          show_order_notes?: boolean
          show_order_status?: boolean
          updated_at?: string
          user_id?: string | null
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
      weekly_pricing: {
        Row: {
          competitor_property_id: string | null
          created_at: string | null
          currency: string | null
          date: string
          house_id: string | null
          id: string
          is_available: boolean | null
          is_expanded: boolean | null
          min_stay: number | null
          period_check_in: string | null
          period_check_out: string | null
          period_nights: number | null
          period_total_price: number | null
          price: number
          scraped_at: string | null
          source: string | null
          updated_at: string | null
        }
        Insert: {
          competitor_property_id?: string | null
          created_at?: string | null
          currency?: string | null
          date: string
          house_id?: string | null
          id?: string
          is_available?: boolean | null
          is_expanded?: boolean | null
          min_stay?: number | null
          period_check_in?: string | null
          period_check_out?: string | null
          period_nights?: number | null
          period_total_price?: number | null
          price: number
          scraped_at?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          competitor_property_id?: string | null
          created_at?: string | null
          currency?: string | null
          date?: string
          house_id?: string | null
          id?: string
          is_available?: boolean | null
          is_expanded?: boolean | null
          min_stay?: number | null
          period_check_in?: string | null
          period_check_out?: string | null
          period_nights?: number | null
          period_total_price?: number | null
          price?: number
          scraped_at?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_pricing_competitor_property_id_fkey"
            columns: ["competitor_property_id"]
            isOneToOne: false
            referencedRelation: "competitor_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_pricing_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_all_table_rows: {
        Args: never
        Returns: {
          row_count: number
          table_name: string
        }[]
      }
      get_database_size: { Args: never; Returns: number }
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
        | "draft"
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
        "draft",
      ],
      user_role: ["admin", "cleaning_provider", "laundry_provider"],
    },
  },
} as const
