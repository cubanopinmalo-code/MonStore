/**
 * Modelos de datos de MONSTORE.
 * Los nombres de campos son los mismos que tendrán las tablas reales,
 * para poder sustituir los datos simulados por el backend sin tocar la UI.
 */

export type Currency = "CUP";

export type DeliveryMethod = "via_id" | "via_cuenta";

export type OrderStatus =
  | "pendiente"
  | "procesando"
  | "completado"
  | "error"
  | "reembolsado"
  | "cancelado";

export type RequestStatus = "pendiente" | "aprobado" | "rechazado";

export type ListingStatus =
  | "pendiente"
  | "aprobada"
  | "rechazada"
  | "vendida"
  | "desactivada";

export type PaymentMethod =
  | "wallet"
  | "saldo_movil"
  | "tarjeta_cup"
  | "usdt"
  | "zelle";

export interface Profile {
  id: string;
  name: string;
  email: string;
  phone: string;
  province: string;
  municipality: string;
  avatar: string | null;
  referral_code: string;
  referred_by: string | null;
  role: "user" | "admin";
  status: "activo" | "suspendido";
  created_at: string;
  updated_at: string;
}

export interface Game {
  id: string;
  g2bulk_id: string;
  name: string;
  slug: string;
  image_url: string;
  description: string;
  category: string;
  active: boolean;
  offers_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProductField {
  key: string;
  label: string;
  placeholder?: string;
  type: "text" | "number" | "select";
  options?: string[];
  required: boolean;
}

export interface Product {
  id: string;
  game_id: string;
  g2bulk_product_id: string;
  name: string;
  description: string;
  image_url: string;
  g2bulk_cost: number;
  sale_price: number;
  currency: Currency;
  delivery_method: DeliveryMethod;
  active: boolean;
  available: boolean;
  metadata: { fields: ProductField[] };
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  code: string;
  user_id: string;
  product_id: string;
  game_id: string;
  player_id: string;
  player_data: Record<string, string>;
  quantity: number;
  unit_price: number;
  total_amount: number;
  currency: Currency;
  payment_method: PaymentMethod;
  status: OrderStatus;
  g2bulk_transaction_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  currency: Currency;
  status: "activa" | "bloqueada";
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  user_id: string;
  type: "deposito" | "compra" | "reembolso" | "retiro" | "ajuste";
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string;
  status: "completado" | "pendiente" | "fallido";
  created_at: string;
}

export interface Deposit {
  id: string;
  user_id: string;
  user_name: string;
  amount: number;
  payment_method: Exclude<PaymentMethod, "wallet">;
  status: RequestStatus;
  proof_image_url: string | null;
  payment_reference: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  user_name: string;
  amount: number;
  fee: number;
  net_amount: number;
  payment_method: Exclude<PaymentMethod, "wallet">;
  payment_destination: string;
  status: RequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  user_name: string;
  order_id: string | null;
  amount: number;
  method: PaymentMethod;
  status: "confirmado" | "pendiente" | "rechazado";
  reference: string;
  proof_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type:
    | "pedido_completado"
    | "pedido_error"
    | "deposito_aprobado"
    | "deposito_rechazado"
    | "retiro_aprobado"
    | "retiro_rechazado"
    | "publicacion_aprobada"
    | "publicacion_rechazada";
  read: boolean;
  created_at: string;
}

export interface Referral {
  id: string;
  referrer_user_id: string;
  referred_user_id: string;
  referred_name: string;
  status: "registrado" | "activo" | "inactivo";
  reward_amount: number;
  created_at: string;
}

export interface GameAccount {
  id: string;
  seller_id: string;
  seller_name: string;
  seller_avatar_url?: string | null;
  game_id: string;
  title: string;
  description: string;
  region: string;
  platform: string;
  price: number;
  currency: Currency;
  images: string[];
  account_email: string;
  account_password: string;
  admin_access_notes: string;
  status: ListingStatus;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiTransaction {
  id: string;
  order_id: string;
  provider: "g2bulk";
  request_data: Record<string, unknown>;
  response_data: Record<string, unknown>;
  provider_transaction_id: string | null;
  status: "ok" | "error";
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentSetting {
  id: string;
  payment_method: Exclude<PaymentMethod, "wallet">;
  label: string;
  destination_number: string;
  card_number: string | null;
  phone_number: string | null;
  instructions: string;
  active: boolean;
  /** % extra que se acredita al depositar por este método (conversión). */
  deposit_bonus_pct: number;
  /** % de comisión al retirar por este método. */
  withdrawal_fee_pct: number;
  /** % de descuento por conversión al retirar por este método. */
  withdrawal_conversion_pct: number;
  /** Datos de transferencia escritos por el administrador (nombre + valor). */
  transfer_fields: { label: string; value: string }[];
  /** Orden de muestra en «Métodos de pago». */
  position: number;
  updated_at: string;
}

export interface SyncStatus {
  provider: "g2bulk";
  connected: boolean;
  last_sync_at: string;
  games_count: number;
  products_count: number;
  new_products: number;
  updated_products: number;
  errors_count: number;
}

export interface AdminStats {
  sales_today: number;
  sales_month: number;
  orders_total: number;
  orders_completed: number;
  orders_pending: number;
  orders_error: number;
  deposits_total: number;
  withdrawals_total: number;
  users_total: number;
  products_active: number;
  provider_cost_month: number;
  margin_month: number;
}

export type EventType = "sala_personalizada";

export type EventStatus =
  | "proximamente"
  | "inscripciones_abiertas"
  | "meta_alcanzada"
  | "sala_activa"
  | "finalizado"
  | "cancelado"
  | "meta_no_alcanzada";

export type SubscriptionPaymentStatus = "pending" | "paid" | "refunded" | "cancelled";

export interface GameEvent {
  id: string;
  name: string;
  game_id: string;
  event_type: EventType;
  prize: string;
  region: string;
  min_participants: number;
  max_participants: number;
  participants_count: number;
  event_date: string;
  event_time: string;
  entry_price: number;
  currency: Currency;
  status: EventStatus;
  room_id: string | null;
  room_password: string | null;
  room_activated_at: string | null;
  entry_window_minutes: number;
  description: string;
  banner_url: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface EventSubscription {
  id: string;
  event_id: string;
  user_id: string;
  user_name: string;
  user_phone: string;
  game_account_id: string;
  g2bulk_account_name: string | null;
  status: "inscrito" | "participando" | "no_asistio" | "cancelado";
  payment_status: SubscriptionPaymentStatus;
  entered_at: string | null;
  created_at: string;
}
