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
      deposits: {
        Row: {
          amount: number
          bonus_pct: number
          created_at: string
          credited_amount: number
          id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_reference: string
          proof_image_url: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["request_status"]
          user_id: string
        }
        Insert: {
          amount: number
          bonus_pct?: number
          created_at?: string
          credited_amount?: number
          id?: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_reference?: string
          proof_image_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          user_id: string
        }
        Update: {
          amount?: number
          bonus_pct?: number
          created_at?: string
          credited_amount?: number
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_reference?: string
          proof_image_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          user_id?: string
        }
        Relationships: []
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
          region: string
          room_activated_at: string | null
          room_id: string | null
          room_password: string | null
          status: Database["public"]["Enums"]["event_status"]
          updated_at: string
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
          region?: string
          room_activated_at?: string | null
          room_id?: string | null
          room_password?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
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
          region?: string
          room_activated_at?: string | null
          room_id?: string | null
          room_password?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
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
      game_account_secrets: {
        Row: {
          account_email: string
          account_id: string
          account_password: string
          admin_access_notes: string
          created_at: string
        }
        Insert: {
          account_email?: string
          account_id: string
          account_password?: string
          admin_access_notes?: string
          created_at?: string
        }
        Update: {
          account_email?: string
          account_id?: string
          account_password?: string
          admin_access_notes?: string
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
          game_id: string | null
          id: string
          images: string[]
          platform: string
          price: number
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
          game_id?: string | null
          id?: string
          images?: string[]
          platform?: string
          price?: number
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
          game_id?: string | null
          id?: string
          images?: string[]
          platform?: string
          price?: number
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
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
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
          created_at: string
          id: boolean
          updated_at: string
          usd_to_cup: number
        }
        Insert: {
          created_at?: string
          id?: boolean
          updated_at?: string
          usd_to_cup?: number
        }
        Update: {
          created_at?: string
          id?: boolean
          updated_at?: string
          usd_to_cup?: number
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          available: boolean
          created_at: string
          currency: string
          delivery_method: Database["public"]["Enums"]["delivery_method"]
          description: string
          g2bulk_cost: number
          g2bulk_product_id: string
          game_id: string
          id: string
          image_url: string
          last_synced_at: string | null
          metadata: Json
          name: string
          sale_price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          available?: boolean
          created_at?: string
          currency?: string
          delivery_method?: Database["public"]["Enums"]["delivery_method"]
          description?: string
          g2bulk_cost?: number
          g2bulk_product_id?: string
          game_id: string
          id?: string
          image_url?: string
          last_synced_at?: string | null
          metadata?: Json
          name: string
          sale_price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          available?: boolean
          created_at?: string
          currency?: string
          delivery_method?: Database["public"]["Enums"]["delivery_method"]
          description?: string
          g2bulk_cost?: number
          g2bulk_product_id?: string
          game_id?: string
          id?: string
          image_url?: string
          last_synced_at?: string | null
          metadata?: Json
          name?: string
          sale_price?: number
          updated_at?: string
        }
        Relationships: [
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
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          referred_user_id: string
          referrer_user_id: string
          reward_amount?: number
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          referred_user_id?: string
          referrer_user_id?: string
          reward_amount?: number
          status?: string
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
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          description: string
          id: string
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
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
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
          id: string
          net_amount: number
          payment_destination: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["request_status"]
          user_id: string
        }
        Insert: {
          amount: number
          conversion_pct?: number
          created_at?: string
          fee?: number
          fee_pct?: number
          id?: string
          net_amount?: number
          payment_destination?: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          user_id: string
        }
        Update: {
          amount?: number
          conversion_pct?: number
          created_at?: string
          fee?: number
          fee_pct?: number
          id?: string
          net_amount?: number
          payment_destination?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
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
      refund_wallet_order: {
        Args: { p_order: string; p_reason: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user"
      delivery_method: "via_id" | "via_cuenta"
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
      payment_method: "wallet" | "saldo_movil" | "tarjeta_cup"
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
      delivery_method: ["via_id", "via_cuenta"],
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
      payment_method: ["wallet", "saldo_movil", "tarjeta_cup"],
      request_status: ["pendiente", "aprobado", "rechazado"],
    },
  },
} as const
