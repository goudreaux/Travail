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
          member_no: number | null
          user_id: string
          name: string
          initials: string
          tier: 'founder' | 'founding_member' | 'administrator'
          home_base_code: string | null
          kyc_verified: boolean
          seat_credits: number
          card_last4: string | null
          joined_at: string
          bio: string | null
          interests: string[] | null
          other_clubs: string[] | null
          avatar_url: string | null
          is_admin: boolean
          private_mode: boolean
          accepts_contact_requests: boolean
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          trial_ends_at: string | null
          current_period_end: string | null
          created_at: string
        }
        Insert: {
          id?: string
          member_no?: number | null
          user_id: string
          name: string
          initials: string
          tier?: 'founder' | 'founding_member' | 'administrator'
          home_base_code?: string | null
          kyc_verified?: boolean
          seat_credits?: number
          card_last4?: string | null
          joined_at?: string
          bio?: string | null
          interests?: string[] | null
          other_clubs?: string[] | null
          avatar_url?: string | null
          is_admin?: boolean
          private_mode?: boolean
          accepts_contact_requests?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          current_period_end?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          member_no?: number | null
          user_id?: string
          name?: string
          initials?: string
          tier?: 'founder' | 'founding_member' | 'administrator'
          home_base_code?: string | null
          kyc_verified?: boolean
          seat_credits?: number
          card_last4?: string | null
          joined_at?: string
          bio?: string | null
          interests?: string[] | null
          other_clubs?: string[] | null
          avatar_url?: string | null
          is_admin?: boolean
          private_mode?: boolean
          accepts_contact_requests?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          current_period_end?: string | null
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
          lat: number | null
          lng: number | null
          active: boolean
        }
        Insert: {
          code: string
          name: string
          sub?: string | null
          role?: 'origin' | 'destination' | 'both'
          lat?: number | null
          lng?: number | null
          active?: boolean
        }
        Update: {
          code?: string
          name?: string
          sub?: string | null
          role?: 'origin' | 'destination' | 'both'
          lat?: number | null
          lng?: number | null
          active?: boolean
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
          capacity: number | null
          price_per_pax: number
          icon: string | null
          description: string | null
        }
        Insert: {
          id?: string
          dest_code: string
          name: string
          operator?: string | null
          capacity?: number | null
          price_per_pax: number
          icon?: string | null
          description?: string | null
        }
        Update: {
          id?: string
          dest_code?: string
          name?: string
          operator?: string | null
          capacity?: number | null
          price_per_pax?: number
          icon?: string | null
          description?: string | null
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
          seats_taken: number
          price_per_seat: number
          status: 'draft' | 'open' | 'full' | 'departed' | 'cancelled'
          image_url: string | null
          is_private: boolean
          anchor_payment_intent_id: string | null
          anchor_captured_cents: number
          anchor_captured_at: string | null
          anchor_refunded_cents: number
          anchor_settled_at: string | null
          cancellation_policy: Json
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
          seats_taken?: number
          price_per_seat: number
          status?: 'draft' | 'open' | 'full' | 'departed' | 'cancelled'
          image_url?: string | null
          is_private?: boolean
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
          seats_taken?: number
          price_per_seat?: number
          status?: 'draft' | 'open' | 'full' | 'departed' | 'cancelled'
          image_url?: string | null
          is_private?: boolean
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
          dest_code: string | null
          aircraft_id: string | null
          date: string
          start_time: string | null
          depart_time: string | null
          arrive_time: string | null
          return_time: string | null
          stay_type: 'day_trip' | 'overnight' | 'multi_night'
          name: string
          pitch: string | null
          icon: string | null
          visibility: 'members' | 'public'
          spots_total: number
          spots_anchor: number
          spots_taken: number
          price_per_pax: number
          status: 'draft' | 'open' | 'full' | 'completed' | 'cancelled'
          image_url: string | null
          itinerary: Json | null
          sponsor: string | null
          is_private: boolean
          anchor_payment_intent_id: string | null
          anchor_captured_cents: number
          anchor_captured_at: string | null
          anchor_refunded_cents: number
          anchor_settled_at: string | null
          cancellation_policy: Json
          created_at: string
        }
        Insert: {
          id?: string
          anchor_member_id?: string | null
          template_id?: string | null
          origin_code: string
          dest_code?: string | null
          aircraft_id?: string | null
          date: string
          start_time?: string | null
          depart_time?: string | null
          arrive_time?: string | null
          return_time?: string | null
          stay_type?: 'day_trip' | 'overnight' | 'multi_night'
          name: string
          pitch?: string | null
          icon?: string | null
          visibility?: 'members' | 'public'
          spots_total: number
          spots_anchor?: number
          spots_taken?: number
          price_per_pax?: number
          status?: 'draft' | 'open' | 'full' | 'completed' | 'cancelled'
          image_url?: string | null
          itinerary?: Json | null
          sponsor?: string | null
          is_private?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          anchor_member_id?: string | null
          template_id?: string | null
          origin_code?: string
          dest_code?: string | null
          aircraft_id?: string | null
          date?: string
          start_time?: string | null
          depart_time?: string | null
          arrive_time?: string | null
          return_time?: string | null
          stay_type?: 'day_trip' | 'overnight' | 'multi_night'
          name?: string
          pitch?: string | null
          icon?: string | null
          visibility?: 'members' | 'public'
          spots_total?: number
          spots_anchor?: number
          spots_taken?: number
          price_per_pax?: number
          status?: 'draft' | 'open' | 'full' | 'completed' | 'cancelled'
          image_url?: string | null
          itinerary?: Json | null
          sponsor?: string | null
          is_private?: boolean
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
          show_on_roster: boolean
          submitted_at: string
          decided_at: string | null
          stripe_payment_intent_id: string | null
          paid_amount_cents: number | null
          paid_at: string | null
          payment_status: string | null
          cancelled_at: string | null
          refund_amount_cents: number | null
          refund_id: string | null
          was_forfeit: boolean
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
          show_on_roster?: boolean
          submitted_at?: string
          decided_at?: string | null
          stripe_payment_intent_id?: string | null
          paid_amount_cents?: number | null
          paid_at?: string | null
          payment_status?: string | null
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
          show_on_roster?: boolean
          submitted_at?: string
          decided_at?: string | null
          stripe_payment_intent_id?: string | null
          paid_amount_cents?: number | null
          paid_at?: string | null
          payment_status?: string | null
        }
        Relationships: []
      }
      anchor_submissions: {
        Row: {
          id: string
          kind: 'flight' | 'excursion'
          member_id: string
          payload: Json
          status: 'pending' | 'approved' | 'declined' | 'published' | 'pending_ops_review' | 'cancelled'
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
          status?: 'pending' | 'approved' | 'declined' | 'published' | 'pending_ops_review' | 'cancelled'
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
          status?: 'pending' | 'approved' | 'declined' | 'published' | 'pending_ops_review' | 'cancelled'
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
          kind: 'booking' | 'flight' | 'excursion' | 'message' | 'system' | 'approval' | 'friend' | 'contact'
          title: string
          body: string
          ref: Json | null
          created_at: string
          read: boolean
        }
        Insert: {
          id?: string
          member_id: string
          kind: 'booking' | 'flight' | 'excursion' | 'message' | 'system' | 'approval' | 'friend' | 'contact'
          title: string
          body: string
          ref?: Json | null
          created_at?: string
          read?: boolean
        }
        Update: {
          id?: string
          member_id?: string
          kind?: 'booking' | 'flight' | 'excursion' | 'message' | 'system' | 'approval' | 'friend' | 'contact'
          title?: string
          body?: string
          ref?: Json | null
          created_at?: string
          read?: boolean
        }
        Relationships: []
      }
      contact_requests: {
        Row: {
          id: string
          requester_id: string
          addressee_id: string
          status: 'pending' | 'granted' | 'declined' | 'revoked'
          note: string | null
          created_at: string
          decided_at: string | null
        }
        Insert: {
          id?: string
          requester_id: string
          addressee_id: string
          status?: 'pending' | 'granted' | 'declined' | 'revoked'
          note?: string | null
          created_at?: string
          decided_at?: string | null
        }
        Update: {
          id?: string
          requester_id?: string
          addressee_id?: string
          status?: 'pending' | 'granted' | 'declined' | 'revoked'
          note?: string | null
          created_at?: string
          decided_at?: string | null
        }
        Relationships: []
      }
      friendships: {
        Row: {
          id: string
          requester_id: string
          addressee_id: string
          status: 'pending' | 'accepted' | 'declined'
          created_at: string
          decided_at: string | null
        }
        Insert: {
          id?: string
          requester_id: string
          addressee_id: string
          status?: 'pending' | 'accepted' | 'declined'
          created_at?: string
          decided_at?: string | null
        }
        Update: {
          id?: string
          requester_id?: string
          addressee_id?: string
          status?: 'pending' | 'accepted' | 'declined'
          created_at?: string
          decided_at?: string | null
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
export type Friendship = Database['public']['Tables']['friendships']['Row']
export type FriendshipStatus = Friendship['status']
export type ContactRequest = Database['public']['Tables']['contact_requests']['Row']
export type ContactRequestStatus = ContactRequest['status']

// Settlement row written by the settlement job at trip-departure.
// Not declared on the Database.Tables map yet because writes happen
// only via service role; the app's only interaction is to render the
// row to the anchor/admin who's reading it.
export interface TripSettlement {
  id: string
  item_kind: 'flight' | 'excursion'
  item_id: string
  charter_total_cents: number
  paid_revenue_cents: number
  anchor_refund_cents: number
  anchor_net_paid_cents: number
  settled_at: string
  settled_by: string | null
  notes: string | null
}

export type MemberTier = Member['tier']
export type MemberSensitive = Database['public']['Tables']['member_sensitive']['Row']
export type FlightStatus = Flight['status']
export type ExcursionStatus = Excursion['status']
export type BookingStatus = Booking['status']
export type SubmissionStatus = AnchorSubmission['status']
export type NotificationKind = Notification['kind']
export type ItemKind = Booking['item_kind']
export type StayType = Excursion['stay_type']
