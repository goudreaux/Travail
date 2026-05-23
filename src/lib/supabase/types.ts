export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      members: {
        Row: {
          id: string
          user_id: string
          name: string
          initials: string
          tier: 'explorer' | 'anchor' | 'founder'
          home_base_code: string | null
          kyc_verified: boolean
          seat_credits: number
          card_last4: string | null
          joined_at: string
          bio: string | null
          interests: string[] | null
          avatar_url: string | null
          is_admin: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          initials: string
          tier?: 'explorer' | 'anchor' | 'founder'
          home_base_code?: string | null
          kyc_verified?: boolean
          seat_credits?: number
          card_last4?: string | null
          joined_at?: string
          bio?: string | null
          interests?: string[] | null
          avatar_url?: string | null
          is_admin?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          initials?: string
          tier?: 'explorer' | 'anchor' | 'founder'
          home_base_code?: string | null
          kyc_verified?: boolean
          seat_credits?: number
          card_last4?: string | null
          joined_at?: string
          bio?: string | null
          interests?: string[] | null
          avatar_url?: string | null
          is_admin?: boolean
          created_at?: string
        }
        Relationships: []
      }
      member_sensitive: {
        Row: {
          member_id: string
          date_of_birth: string | null
          email: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          member_id: string
          date_of_birth?: string | null
          email?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          member_id?: string
          date_of_birth?: string | null
          email?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      airports: {
        Row: {
          code: string
          name: string
          sub: string | null
          role: 'origin' | 'destination' | 'both'
        }
        Insert: {
          code: string
          name: string
          sub?: string | null
          role?: 'origin' | 'destination' | 'both'
        }
        Update: {
          code?: string
          name?: string
          sub?: string | null
          role?: 'origin' | 'destination' | 'both'
        }
        Relationships: []
      }
      aircraft: {
        Row: {
          id: string
          name: string
          description: string | null
          capacity: number
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          capacity: number
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          capacity?: number
        }
        Relationships: []
      }
      excursion_templates: {
        Row: {
          id: string
          dest_code: string
          name: string
          operator: string | null
          capacity: number
          price_per_pax: number
          icon: string | null
        }
        Insert: {
          id?: string
          dest_code: string
          name: string
          operator?: string | null
          capacity: number
          price_per_pax: number
          icon?: string | null
        }
        Update: {
          id?: string
          dest_code?: string
          name?: string
          operator?: string | null
          capacity?: number
          price_per_pax?: number
          icon?: string | null
        }
        Relationships: []
      }
      flights: {
        Row: {
          id: string
          anchor_member_id: string | null
          origin_code: string
          dest_code: string
          date: string
          depart_time: string
          duration_mins: number
          aircraft_id: string
          name: string
          pitch: string | null
          visibility: 'members' | 'public'
          seats_total: number
          seats_anchor: number
          price_per_seat: number
          status: 'draft' | 'open' | 'full' | 'departed' | 'cancelled'
          created_at: string
        }
        Insert: {
          id?: string
          anchor_member_id?: string | null
          origin_code: string
          dest_code: string
          date: string
          depart_time: string
          duration_mins: number
          aircraft_id: string
          name: string
          pitch?: string | null
          visibility?: 'members' | 'public'
          seats_total: number
          seats_anchor?: number
          price_per_seat: number
          status?: 'draft' | 'open' | 'full' | 'departed' | 'cancelled'
          created_at?: string
        }
        Update: {
          id?: string
          anchor_member_id?: string | null
          origin_code?: string
          dest_code?: string
          date?: string
          depart_time?: string
          duration_mins?: number
          aircraft_id?: string
          name?: string
          pitch?: string | null
          visibility?: 'members' | 'public'
          seats_total?: number
          seats_anchor?: number
          price_per_seat?: number
          status?: 'draft' | 'open' | 'full' | 'departed' | 'cancelled'
          created_at?: string
        }
        Relationships: []
      }
      excursions: {
        Row: {
          id: string
          anchor_member_id: string | null
          template_id: string | null
          origin_code: string
          aircraft_id: string | null
          date: string
          start_time: string | null
          depart_time: string | null
          arrive_time: string | null
          return_time: string | null
          stay_type: 'day_trip' | 'overnight' | 'multi_night'
          name: string
          pitch: string | null
          visibility: 'members' | 'public'
          spots_total: number
          spots_anchor: number
          price_per_pax: number
          status: 'draft' | 'open' | 'full' | 'completed' | 'cancelled'
          created_at: string
        }
        Insert: {
          id?: string
          anchor_member_id?: string | null
          template_id?: string | null
          origin_code: string
          aircraft_id?: string | null
          date: string
          start_time?: string | null
          depart_time?: string | null
          arrive_time?: string | null
          return_time?: string | null
          stay_type?: 'day_trip' | 'overnight' | 'multi_night'
          name: string
          pitch?: string | null
          visibility?: 'members' | 'public'
          spots_total: number
          spots_anchor?: number
          price_per_pax?: number
          status?: 'draft' | 'open' | 'full' | 'completed' | 'cancelled'
          created_at?: string
        }
        Update: {
          id?: string
          anchor_member_id?: string | null
          template_id?: string | null
          origin_code?: string
          aircraft_id?: string | null
          date?: string
          start_time?: string | null
          depart_time?: string | null
          arrive_time?: string | null
          return_time?: string | null
          stay_type?: 'day_trip' | 'overnight' | 'multi_night'
          name?: string
          pitch?: string | null
          visibility?: 'members' | 'public'
          spots_total?: number
          spots_anchor?: number
          price_per_pax?: number
          status?: 'draft' | 'open' | 'full' | 'completed' | 'cancelled'
          created_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          id: string
          member_id: string
          item_kind: 'flight' | 'excursion'
          item_id: string
          seats: number
          price_per_seat: number
          fees: number
          total: number
          payment_method: 'card' | 'credits' | 'wire'
          status: 'pending' | 'approved' | 'declined' | 'cancelled' | 'refunded'
          confirmation_code: string | null
          decline_reason: string | null
          submitted_at: string
          decided_at: string | null
        }
        Insert: {
          id?: string
          member_id: string
          item_kind: 'flight' | 'excursion'
          item_id: string
          seats: number
          price_per_seat: number
          fees?: number
          total: number
          payment_method?: 'card' | 'credits' | 'wire'
          status?: 'pending' | 'approved' | 'declined' | 'cancelled' | 'refunded'
          confirmation_code?: string | null
          decline_reason?: string | null
          submitted_at?: string
          decided_at?: string | null
        }
        Update: {
          id?: string
          member_id?: string
          item_kind?: 'flight' | 'excursion'
          item_id?: string
          seats?: number
          price_per_seat?: number
          fees?: number
          total?: number
          payment_method?: 'card' | 'credits' | 'wire'
          status?: 'pending' | 'approved' | 'declined' | 'cancelled' | 'refunded'
          confirmation_code?: string | null
          decline_reason?: string | null
          submitted_at?: string
          decided_at?: string | null
        }
        Relationships: []
      }
      anchor_submissions: {
        Row: {
          id: string
          kind: 'flight' | 'excursion'
          member_id: string
          payload: Json
          status: 'pending' | 'approved' | 'declined' | 'published'
          submitted_at: string
          decided_at: string | null
          published_item_id: string | null
          decline_reason: string | null
        }
        Insert: {
          id?: string
          kind: 'flight' | 'excursion'
          member_id: string
          payload: Json
          status?: 'pending' | 'approved' | 'declined' | 'published'
          submitted_at?: string
          decided_at?: string | null
          published_item_id?: string | null
          decline_reason?: string | null
        }
        Update: {
          id?: string
          kind?: 'flight' | 'excursion'
          member_id?: string
          payload?: Json
          status?: 'pending' | 'approved' | 'declined' | 'published'
          submitted_at?: string
          decided_at?: string | null
          published_item_id?: string | null
          decline_reason?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          member_id: string
          kind: 'booking' | 'flight' | 'excursion' | 'message' | 'system' | 'approval'
          title: string
          body: string
          ref: Json | null
          created_at: string
          read: boolean
        }
        Insert: {
          id?: string
          member_id: string
          kind: 'booking' | 'flight' | 'excursion' | 'message' | 'system' | 'approval'
          title: string
          body: string
          ref?: Json | null
          created_at?: string
          read?: boolean
        }
        Update: {
          id?: string
          member_id?: string
          kind?: 'booking' | 'flight' | 'excursion' | 'message' | 'system' | 'approval'
          title?: string
          body?: string
          ref?: Json | null
          created_at?: string
          read?: boolean
        }
        Relationships: []
      }
      posts: {
        Row: {
          id: string
          author_id: string
          author_kind: 'member' | 'system'
          body: string
          quote: string | null
          kind: 'text' | 'trip_report' | 'announcement' | 'photo'
          likes: number
          created_at: string
        }
        Insert: {
          id?: string
          author_id: string
          author_kind?: 'member' | 'system'
          body: string
          quote?: string | null
          kind?: 'text' | 'trip_report' | 'announcement' | 'photo'
          likes?: number
          created_at?: string
        }
        Update: {
          id?: string
          author_id?: string
          author_kind?: 'member' | 'system'
          body?: string
          quote?: string | null
          kind?: 'text' | 'trip_report' | 'announcement' | 'photo'
          likes?: number
          created_at?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          id: string
          post_id: string
          author_id: string
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          post_id: string
          author_id: string
          body: string
          created_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          author_id?: string
          body?: string
          created_at?: string
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
      [_ in never]: never
    }
  }
}

// ─── Convenience type aliases ────────────────────────────────────────────────

export type Member = Database['public']['Tables']['members']['Row']
export type Airport = Database['public']['Tables']['airports']['Row']
export type Aircraft = Database['public']['Tables']['aircraft']['Row']
export type ExcursionTemplate = Database['public']['Tables']['excursion_templates']['Row']
export type Flight = Database['public']['Tables']['flights']['Row']
export type Excursion = Database['public']['Tables']['excursions']['Row']
export type Booking = Database['public']['Tables']['bookings']['Row']
export type AnchorSubmission = Database['public']['Tables']['anchor_submissions']['Row']
export type Notification = Database['public']['Tables']['notifications']['Row']
export type Post = Database['public']['Tables']['posts']['Row']
export type Comment = Database['public']['Tables']['comments']['Row']

export type MemberTier = Member['tier']
export type MemberSensitive = Database['public']['Tables']['member_sensitive']['Row']
export type FlightStatus = Flight['status']
export type ExcursionStatus = Excursion['status']
export type BookingStatus = Booking['status']
export type SubmissionStatus = AnchorSubmission['status']
export type NotificationKind = Notification['kind']
export type ItemKind = Booking['item_kind']
export type StayType = Excursion['stay_type']
