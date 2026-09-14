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
      api_transactions: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          order_id: string | null
          provider: string
          provider_transaction_id: string | null
          request_data: Json
          response_data: Json
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          order_id?: string | null
          provider?: string
          provider_transaction_id?: string | null
          request_data?: Json
          response_data?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          order_id?: string | null
          provider?: string
          provider_transaction_id?: string | null
          request_data?: Json
          response_data?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          amount: number | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_id: string | null
          id: string
          line_id: string | null
          metadata: Json
          note: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          amount?: number | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_id?: string | null
          id?: string
          line_id?: string | null
          metadata?: Json
          note?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          amount?: number | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_id?: string | null
          id?: string
          line_id?: string | null
          metadata?: Json
          note?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      currency_switch_log: {
        Row: {
          created_at: string
          currency: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      deposits: {
        Row: {
          amount: number
          approval_method: string
          bank: string | null
          bonus_pct: number
          created_at: string
          credited_amount: number
          destination_id: string | null
          destination_value: string | null
          flow_status: string
          id: string
          line_assigned_at: string | null
          line_id: string | null
          line_number: number | null
          line_phone: string | null
          line_released_at: string | null
          payment_channel: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_received_at: string | null
          payment_reference: string
          payment_submethod: string | null
          proof_image_url: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sender_phone: string | null
          status: Database["public"]["Enums"]["request_status"]
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          approval_method?: string
          bank?: string | null
          bonus_pct?: number
          created_at?: string
          credited_amount?: number
          destination_id?: string | null
          destination_value?: string | null
          flow_status?: string
          id?: string
          line_assigned_at?: string | null
          line_id?: string | null
          line_number?: number | null
          line_phone?: string | null
          line_released_at?: string | null
          payment_channel?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_received_at?: string | null
          payment_reference?: string
          payment_submethod?: string | null
          proof_image_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_phone?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          approval_method?: string
          bank?: string | null
          bonus_pct?: number
          created_at?: string
          credited_amount?: number
          destination_id?: string | null
          destination_value?: string | null
          flow_status?: string
          id?: string
          line_assigned_at?: string | null
          line_id?: string | null
          line_number?: number | null
          line_phone?: string | null
          line_released_at?: string | null
          payment_channel?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_received_at?: string | null
          payment_reference?: string
          payment_submethod?: string | null
          proof_image_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_phone?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposits_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "payment_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "payment_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      event_subscriptions: {
        Row: {
          created_at: string
          entered_at: string | null
          event_id: string
          g2bulk_account_name: string | null
          game_account_id: string
          id: string
          payment_status: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entered_at?: string | null
          event_id: string
          g2bulk_account_name?: string | null
          game_account_id: string
          id?: string
          payment_status?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entered_at?: string | null
          event_id?: string
          g2bulk_account_name?: string | null
          game_account_id?: string
          id?: string
          payment_status?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_subscriptions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_subscriptions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          banner_url: string | null
          created_at: string
          currency: string
          description: string
          entry_price: number
          entry_window_minutes: number
          event_date: string | null
          event_time: string
          event_type: string
          finished_at: string | null
          game_id: string | null
          id: string
          max_participants: number
          min_participants: number
          name: string
          prize: string
          prize_delivered_at: string | null
          region: string
          result_note: string
          result_published_at: string | null
          room_activated_at: string | null
          room_id: string | null
          room_password: string | null
          status: Database["public"]["Enums"]["event_status"]
          updated_at: string
          winner_subscription_id: string | null
          winner_user_id: string | null
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          currency?: string
          description?: string
          entry_price?: number
          entry_window_minutes?: number
          event_date?: string | null
          event_time?: string
          event_type?: string
          finished_at?: string | null
          game_id?: string | null
          id?: string
          max_participants?: number
          min_participants?: number
          name: string
          prize?: string
          prize_delivered_at?: string | null
          region?: string
          result_note?: string
          result_published_at?: string | null
          room_activated_at?: string | null
          room_id?: string | null
          room_password?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
          winner_subscription_id?: string | null
          winner_user_id?: string | null
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          currency?: string
          description?: string
          entry_price?: number
          entry_window_minutes?: number
          event_date?: string | null
          event_time?: string
          event_type?: string
          finished_at?: string | null
          game_id?: string | null
          id?: string
          max_participants?: number
          min_participants?: number
          name?: string
          prize?: string
          prize_delivered_at?: string | null
          region?: string
          result_note?: string
          result_published_at?: string | null
          room_activated_at?: string | null
          room_id?: string | null
          room_password?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
          winner_subscription_id?: string | null
          winner_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_winner_subscription_fk"
            columns: ["winner_subscription_id"]
            isOneToOne: false
            referencedRelation: "event_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      game_account_secrets: {
        Row: {
          account_email: string
          account_email_enc: string | null
          account_id: string
          account_password: string
          account_password_enc: string | null
          admin_access_notes: string
          admin_access_notes_enc: string | null
          created_at: string
        }
        Insert: {
          account_email?: string
          account_email_enc?: string | null
          account_id: string
          account_password?: string
          account_password_enc?: string | null
          admin_access_notes?: string
          admin_access_notes_enc?: string | null
          created_at?: string
        }
        Update: {
          account_email?: string
          account_email_enc?: string | null
          account_id?: string
          account_password?: string
          account_password_enc?: string | null
          admin_access_notes?: string
          admin_access_notes_enc?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_account_secrets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "game_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      game_accounts: {
        Row: {
          created_at: string
          currency: string
          description: string
          duration_days: number
          expires_at: string | null
          game_id: string | null
          id: string
          images: string[]
          platform: string
          price: number
          publish_fee: number
          published_at: string | null
          region: string
          rejection_reason: string | null
          seller_id: string
          seller_name: string
          status: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string
          duration_days?: number
          expires_at?: string | null
          game_id?: string | null
          id?: string
          images?: string[]
          platform?: string
          price?: number
          publish_fee?: number
          published_at?: string | null
          region?: string
          rejection_reason?: string | null
          seller_id: string
          seller_name?: string
          status?: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string
          duration_days?: number
          expires_at?: string | null
          game_id?: string | null
          id?: string
          images?: string[]
          platform?: string
          price?: number
          publish_fee?: number
          published_at?: string | null
          region?: string
          rejection_reason?: string | null
          seller_id?: string
          seller_name?: string
          status?: Database["public"]["Enums"]["listing_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_accounts_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          active: boolean
          category: string
          created_at: string
          description: string
          g2bulk_id: string
          id: string
          image_url: string
          name: string
          platforms: string[]
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string
          g2bulk_id?: string
          id?: string
          image_url?: string
          name: string
          platforms?: string[]
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string
          g2bulk_id?: string
          id?: string
          image_url?: string
          name?: string
          platforms?: string[]
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_campaigns: {
        Row: {
          audience: string
          created_at: string
          created_by: string | null
          delivered_count: number
          id: string
          message: string
          recipients_count: number
          sent_at: string | null
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          audience?: string
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          id?: string
          message: string
          recipients_count?: number
          sent_at?: string | null
          status?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          audience?: string
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          id?: string
          message?: string
          recipients_count?: number
          sent_at?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          campaign_id: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          message?: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "notification_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          note: string
          order_id: string
          status_after: Database["public"]["Enums"]["order_status"]
          status_before: Database["public"]["Enums"]["order_status"] | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string
          order_id: string
          status_after: Database["public"]["Enums"]["order_status"]
          status_before?: Database["public"]["Enums"]["order_status"] | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string
          order_id?: string
          status_after?: Database["public"]["Enums"]["order_status"]
          status_before?: Database["public"]["Enums"]["order_status"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          code: string
          completed_at: string | null
          created_at: string
          currency: string
          error_message: string | null
          g2bulk_transaction_id: string | null
          game_id: string | null
          id: string
          idempotency_key: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          player_data: Json
          player_id: string
          product_id: string | null
          quantity: number
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number
          unit_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          code?: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          error_message?: string | null
          g2bulk_transaction_id?: string | null
          game_id?: string | null
          id?: string
          idempotency_key?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          player_data?: Json
          player_id?: string
          product_id?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          unit_price?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          error_message?: string | null
          g2bulk_transaction_id?: string | null
          game_id?: string | null
          id?: string
          idempotency_key?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          player_data?: Json
          player_id?: string
          product_id?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          unit_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_challenges: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          max_attempts: number
          phone_e164: string
          provider_message_id: string | null
          request_ip: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          max_attempts?: number
          phone_e164: string
          provider_message_id?: string | null
          request_ip?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          max_attempts?: number
          phone_e164?: string
          provider_message_id?: string | null
          request_ip?: string | null
        }
        Relationships: []
      }
      otp_limits: {
        Row: {
          code_length: number
          daily_sms_cap: number | null
          id: boolean
          max_attempts: number
          max_per_ip_per_hour: number
          max_per_phone_per_day: number
          resend_cooldown_seconds: number
          ttl_seconds: number
          updated_at: string
        }
        Insert: {
          code_length?: number
          daily_sms_cap?: number | null
          id?: boolean
          max_attempts?: number
          max_per_ip_per_hour?: number
          max_per_phone_per_day?: number
          resend_cooldown_seconds?: number
          ttl_seconds?: number
          updated_at?: string
        }
        Update: {
          code_length?: number
          daily_sms_cap?: number | null
          id?: boolean
          max_attempts?: number
          max_per_ip_per_hour?: number
          max_per_phone_per_day?: number
          resend_cooldown_seconds?: number
          ttl_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      otp_sms_log: {
        Row: {
          created_at: string
          error_code: string | null
          id: string
          ip_hash: string | null
          outcome: string
          phone_hash: string
          phone_masked: string
          provider_message_id: string | null
          provider_mode: string | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          id?: string
          ip_hash?: string | null
          outcome: string
          phone_hash: string
          phone_masked: string
          provider_message_id?: string | null
          provider_mode?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          id?: string
          ip_hash?: string | null
          outcome?: string
          phone_hash?: string
          phone_masked?: string
          provider_message_id?: string | null
          provider_mode?: string | null
        }
        Relationships: []
      }
      payment_destinations: {
        Row: {
          active: boolean
          bank: string | null
          channel: string
          created_at: string
          description: string
          destination_value: string
          id: string
          instructions: string
          kind: string
          label: string
          position: number
          requires_proof: boolean
          requires_sender_phone: boolean
          requires_transaction_id: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          bank?: string | null
          channel: string
          created_at?: string
          description?: string
          destination_value?: string
          id?: string
          instructions?: string
          kind?: string
          label?: string
          position?: number
          requires_proof?: boolean
          requires_sender_phone?: boolean
          requires_transaction_id?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          bank?: string | null
          channel?: string
          created_at?: string
          description?: string
          destination_value?: string
          id?: string
          instructions?: string
          kind?: string
          label?: string
          position?: number
          requires_proof?: boolean
          requires_sender_phone?: boolean
          requires_transaction_id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      payment_line_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          deposit_id: string | null
          id: string
          line_id: string | null
          note: string
          user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          deposit_id?: string | null
          id?: string
          line_id?: string | null
          note?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          deposit_id?: string | null
          id?: string
          line_id?: string | null
          note?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_line_events_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "deposits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_line_events_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "payment_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_lines: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          id: string
          label: string
          line_number: number
          max_pending_amount: number | null
          notes: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          phone_number: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          id?: string
          label?: string
          line_number: number
          max_pending_amount?: number | null
          notes?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          phone_number?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          id?: string
          label?: string
          line_number?: number
          max_pending_amount?: number | null
          notes?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          phone_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_settings: {
        Row: {
          active: boolean
          card_number: string | null
          deposit_bonus_pct: number
          destination_number: string
          id: string
          instructions: string
          label: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          phone_number: string | null
          position: number
          transfer_fields: Json
          updated_at: string
          withdrawal_conversion_pct: number
          withdrawal_fee_pct: number
        }
        Insert: {
          active?: boolean
          card_number?: string | null
          deposit_bonus_pct?: number
          destination_number?: string
          id?: string
          instructions?: string
          label: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          phone_number?: string | null
          position?: number
          transfer_fields?: Json
          updated_at?: string
          withdrawal_conversion_pct?: number
          withdrawal_fee_pct?: number
        }
        Update: {
          active?: boolean
          card_number?: string | null
          deposit_bonus_pct?: number
          destination_number?: string
          id?: string
          instructions?: string
          label?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          phone_number?: string | null
          position?: number
          transfer_fields?: Json
          updated_at?: string
          withdrawal_conversion_pct?: number
          withdrawal_fee_pct?: number
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string | null
          proof_image_url: string | null
          reference: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id?: string | null
          proof_image_url?: string | null
          reference?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          order_id?: string | null
          proof_image_url?: string | null
          reference?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          allow_line_reuse: boolean
          created_at: string
          id: boolean
          listing_fee_per_day: number
          saldo_conversion_rate: number
          support_whatsapp: string
          updated_at: string
          usd_margin_cup: number
          usd_to_cup: number
          withdrawal_fee_pct: number
        }
        Insert: {
          allow_line_reuse?: boolean
          created_at?: string
          id?: boolean
          listing_fee_per_day?: number
          saldo_conversion_rate?: number
          support_whatsapp?: string
          updated_at?: string
          usd_margin_cup?: number
          usd_to_cup?: number
          withdrawal_fee_pct?: number
        }
        Update: {
          allow_line_reuse?: boolean
          created_at?: string
          id?: boolean
          listing_fee_per_day?: number
          saldo_conversion_rate?: number
          support_whatsapp?: string
          updated_at?: string
          usd_margin_cup?: number
          usd_to_cup?: number
          withdrawal_fee_pct?: number
        }
        Relationships: []
      }
      price_history: {
        Row: {
          actor_id: string | null
          batch_id: string
          created_at: string
          id: string
          note: string
          origin: string
          price_after: number
          price_before: number
          product_id: string
          provider_cost: number
          reverted_at: string | null
          rule_id: string | null
        }
        Insert: {
          actor_id?: string | null
          batch_id?: string
          created_at?: string
          id?: string
          note?: string
          origin?: string
          price_after?: number
          price_before?: number
          product_id: string
          provider_cost?: number
          reverted_at?: string | null
          rule_id?: string | null
        }
        Update: {
          actor_id?: string | null
          batch_id?: string
          created_at?: string
          id?: string
          note?: string
          origin?: string
          price_after?: number
          price_before?: number
          product_id?: string
          provider_cost?: number
          reverted_at?: string | null
          rule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          active: boolean
          category: string | null
          cost_max: number | null
          cost_min: number | null
          created_at: string
          created_by: string | null
          delivery_method: Database["public"]["Enums"]["delivery_method"] | null
          ends_at: string | null
          game_id: string | null
          id: string
          margin_fixed: number
          margin_pct: number
          max_price: number | null
          min_price: number | null
          note: string
          priority: number
          product_id: string | null
          region: string | null
          rounding_step: number
          scope: string
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          cost_max?: number | null
          cost_min?: number | null
          created_at?: string
          created_by?: string | null
          delivery_method?:
            | Database["public"]["Enums"]["delivery_method"]
            | null
          ends_at?: string | null
          game_id?: string | null
          id?: string
          margin_fixed?: number
          margin_pct?: number
          max_price?: number | null
          min_price?: number | null
          note?: string
          priority?: number
          product_id?: string | null
          region?: string | null
          rounding_step?: number
          scope: string
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          cost_max?: number | null
          cost_min?: number | null
          created_at?: string
          created_by?: string | null
          delivery_method?:
            | Database["public"]["Enums"]["delivery_method"]
            | null
          ends_at?: string | null
          game_id?: string | null
          id?: string
          margin_fixed?: number
          margin_pct?: number
          max_price?: number | null
          min_price?: number | null
          note?: string
          priority?: number
          product_id?: string | null
          region?: string | null
          rounding_step?: number
          scope?: string
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          applied_rule_id: string | null
          available: boolean
          created_at: string
          currency: string
          delivery_method: Database["public"]["Enums"]["delivery_method"]
          description: string
          discount_pct: number
          featured: boolean
          g2bulk_cost: number
          g2bulk_product_id: string
          game_id: string
          id: string
          image_url: string
          last_synced_at: string | null
          metadata: Json
          name: string
          price_source: string
          price_updated_at: string | null
          promo_ends_at: string | null
          promo_price: number | null
          promo_starts_at: string | null
          provider: string
          region: string
          sale_price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          applied_rule_id?: string | null
          available?: boolean
          created_at?: string
          currency?: string
          delivery_method?: Database["public"]["Enums"]["delivery_method"]
          description?: string
          discount_pct?: number
          featured?: boolean
          g2bulk_cost?: number
          g2bulk_product_id?: string
          game_id: string
          id?: string
          image_url?: string
          last_synced_at?: string | null
          metadata?: Json
          name: string
          price_source?: string
          price_updated_at?: string | null
          promo_ends_at?: string | null
          promo_price?: number | null
          promo_starts_at?: string | null
          provider?: string
          region?: string
          sale_price?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          applied_rule_id?: string | null
          available?: boolean
          created_at?: string
          currency?: string
          delivery_method?: Database["public"]["Enums"]["delivery_method"]
          description?: string
          discount_pct?: number
          featured?: boolean
          g2bulk_cost?: number
          g2bulk_product_id?: string
          game_id?: string
          id?: string
          image_url?: string
          last_synced_at?: string | null
          metadata?: Json
          name?: string
          price_source?: string
          price_updated_at?: string | null
          promo_ends_at?: string | null
          promo_price?: number | null
          promo_starts_at?: string | null
          provider?: string
          region?: string
          sale_price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_applied_rule_fk"
            columns: ["applied_rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar: string | null
          created_at: string
          id: string
          municipality: string
          name: string
          phone: string
          province: string
          referral_code: string
          referred_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avatar?: string | null
          created_at?: string
          id: string
          municipality?: string
          name?: string
          phone?: string
          province?: string
          referral_code?: string
          referred_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          avatar?: string | null
          created_at?: string
          id?: string
          municipality?: string
          name?: string
          phone?: string
          province?: string
          referral_code?: string
          referred_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referred_user_id: string
          referrer_user_id: string
          reward_amount: number
          reward_claimed_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          referred_user_id: string
          referrer_user_id: string
          reward_amount?: number
          reward_claimed_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          referred_user_id?: string
          referrer_user_id?: string
          reward_amount?: number
          reward_claimed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      user_currency_prefs: {
        Row: {
          created_at: string
          currency: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_favorite_games: {
        Row: {
          created_at: string
          game_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_favorite_games_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
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
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          description: string
          id: string
          idempotency_key: string | null
          reference_id: string | null
          reference_type: string | null
          status: string
          type: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          description?: string
          id?: string
          idempotency_key?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          type: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          description?: string
          id?: string
          idempotency_key?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          type?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          held_balance: number
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          held_balance?: number
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          held_balance?: number
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          amount: number
          conversion_pct: number
          created_at: string
          fee: number
          fee_pct: number
          held_amount: number
          id: string
          line_id: string | null
          line_number: number | null
          line_released_at: string | null
          net_amount: number
          payment_destination: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          processed_at: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["request_status"]
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          conversion_pct?: number
          created_at?: string
          fee?: number
          fee_pct?: number
          held_amount?: number
          id?: string
          line_id?: string | null
          line_number?: number | null
          line_released_at?: string | null
          net_amount?: number
          payment_destination?: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          processed_at?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          conversion_pct?: number
          created_at?: string
          fee?: number
          fee_pct?: number
          held_amount?: number
          id?: string
          line_id?: string | null
          line_number?: number | null
          line_released_at?: string | null
          net_amount?: number
          payment_destination?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          processed_at?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "payment_lines"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      events_public: {
        Row: {
          banner_url: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          entry_price: number | null
          entry_window_minutes: number | null
          event_date: string | null
          event_time: string | null
          event_type: string | null
          finished_at: string | null
          game_id: string | null
          id: string | null
          max_participants: number | null
          min_participants: number | null
          name: string | null
          prize: string | null
          region: string | null
          room_activated_at: string | null
          status: Database["public"]["Enums"]["event_status"] | null
        }
        Insert: {
          banner_url?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          entry_price?: number | null
          entry_window_minutes?: number | null
          event_date?: string | null
          event_time?: string | null
          event_type?: string | null
          finished_at?: string | null
          game_id?: string | null
          id?: string | null
          max_participants?: number | null
          min_participants?: number | null
          name?: string | null
          prize?: string | null
          region?: string | null
          room_activated_at?: string | null
          status?: Database["public"]["Enums"]["event_status"] | null
        }
        Update: {
          banner_url?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          entry_price?: number | null
          entry_window_minutes?: number | null
          event_date?: string | null
          event_time?: string | null
          event_type?: string | null
          finished_at?: string | null
          game_id?: string | null
          id?: string | null
          max_participants?: number | null
          min_participants?: number | null
          name?: string | null
          prize?: string | null
          region?: string | null
          room_activated_at?: string | null
          status?: Database["public"]["Enums"]["event_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      claim_referral_reward: { Args: { p_user: string }; Returns: Json }
      enter_event_room: { Args: { p_event: string }; Returns: Json }
      event_participant_counts: {
        Args: never
        Returns: {
          event_id: string
          participants: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      place_wallet_order: {
        Args: {
          p_idempotency_key: string
          p_player_data: Json
          p_player_id: string
          p_product: string
          p_user: string
        }
        Returns: Json
      }
      provision_user_account: {
        Args: { _phone: string; _referral_code?: string; _user_id: string }
        Returns: Json
      }
      publish_game_account: {
        Args: {
          p_days: number
          p_email: string
          p_game: string
          p_images: string[]
          p_notes: string
          p_password: string
          p_platform: string
          p_price: number
          p_region: string
          p_title: string
        }
        Returns: Json
      }
      read_account_credentials: { Args: { p_account: string }; Returns: Json }
      refund_wallet_order: {
        Args: { p_order: string; p_reason: string }
        Returns: Json
      }
      release_payment_line: {
        Args: { p_deposit: string; p_reason: string }
        Returns: Json
      }
      request_deposit: {
        Args: {
          p_amount: number
          p_has_proof: boolean
          p_method: Database["public"]["Enums"]["payment_method"]
          p_reference: string
          p_user: string
        }
        Returns: Json
      }
      request_deposit_v2: {
        Args: {
          p_amount: number
          p_destination?: string
          p_has_proof: boolean
          p_method: Database["public"]["Enums"]["payment_method"]
          p_proof_url?: string
          p_reference: string
          p_sender_phone?: string
          p_transaction_id?: string
          p_user: string
        }
        Returns: Json
      }
      request_withdrawal: {
        Args: {
          p_amount: number
          p_destination: string
          p_method: Database["public"]["Enums"]["payment_method"]
        }
        Returns: Json
      }
      review_deposit: {
        Args: {
          p_admin: string
          p_approve: boolean
          p_deposit: string
          p_reason: string
        }
        Returns: Json
      }
      review_game_account: {
        Args: { p_approve: boolean; p_listing: string; p_reason: string }
        Returns: Json
      }
      review_withdrawal: {
        Args: { p_approve: boolean; p_reason: string; p_withdrawal: string }
        Returns: Json
      }
      set_display_currency: { Args: { p_currency: string }; Returns: Json }
      subscribe_event: {
        Args: { p_event: string; p_game_account_id: string }
        Returns: Json
      }
      top_recharged_games: {
        Args: { _limit?: number }
        Returns: {
          game_id: string
          orders_count: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      delivery_method: "via_id" | "via_cuenta" | "codigo"
      event_status:
        | "proximamente"
        | "inscripciones_abiertas"
        | "meta_alcanzada"
        | "sala_activa"
        | "finalizado"
        | "cancelado"
        | "meta_no_alcanzada"
      listing_status:
        | "pendiente"
        | "aprobada"
        | "rechazada"
        | "vendida"
        | "desactivada"
      order_status:
        | "pendiente"
        | "procesando"
        | "completado"
        | "error"
        | "reembolsado"
        | "cancelado"
      payment_method:
        | "wallet"
        | "saldo_movil"
        | "tarjeta_cup"
        | "usdt"
        | "zelle"
      request_status: "pendiente" | "aprobado" | "rechazado"
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
      app_role: ["admin", "user"],
      delivery_method: ["via_id", "via_cuenta", "codigo"],
      event_status: [
        "proximamente",
        "inscripciones_abiertas",
        "meta_alcanzada",
        "sala_activa",
        "finalizado",
        "cancelado",
        "meta_no_alcanzada",
      ],
      listing_status: [
        "pendiente",
        "aprobada",
        "rechazada",
        "vendida",
        "desactivada",
      ],
      order_status: [
        "pendiente",
        "procesando",
        "completado",
        "error",
        "reembolsado",
        "cancelado",
      ],
      payment_method: ["wallet", "saldo_movil", "tarjeta_cup", "usdt", "zelle"],
      request_status: ["pendiente", "aprobado", "rechazado"],
    },
  },
} as const
