import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type DbPaymentMethod = Database["public"]["Enums"]["payment_method"];

/** Dato de transferencia escrito por el administrador (nombre + valor). */
export interface TransferField {
  label: string;
  value: string;
}

export interface PaymentMethodInfo {
  payment_method: string;
  label: string;
  instructions: string;
  active: boolean;
  deposit_bonus_pct: number;
  withdrawal_fee_pct: number;
  withdrawal_conversion_pct: number;
  transfer_fields: TransferField[];
  position: number;
}

interface PaymentSettingsClient {
  from: (table: string) => {
    select: (columns: string) => {
      order: (column: string, options: { ascending: boolean }) => Promise<{
        data: unknown[] | null;
        error: { message: string } | null;
      }>;
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}

function parseFields(value: unknown): TransferField[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      label: typeof item["label"] === "string" ? item["label"] : "",
      value: typeof item["value"] === "string" ? item["value"] : "",
    }));
}

async function requireAdmin(supabase: PaymentSettingsClient, userId: string): Promise<void> {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error("No se pudo verificar tu permiso.");
  if (!data) throw new Error("Solo el administrador puede cambiar los métodos de pago.");
}

/** Métodos de pago configurados por el administrador, en el orden de muestra. */
export const listPaymentMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaymentMethodInfo[]> => {
    const { data, error } = await context.supabase
      .from("payment_settings")
      .select(
        "payment_method, label, instructions, active, deposit_bonus_pct, withdrawal_fee_pct, withdrawal_conversion_pct, transfer_fields, position",
      )
      .order("position", { ascending: true });
    if (error) throw new Error("No se pudieron cargar los métodos de pago.");
    return (data ?? []).map((row) => ({
      payment_method: String(row.payment_method),
      label: String(row.label),
      instructions: String(row.instructions ?? ""),
      active: Boolean(row.active),
      deposit_bonus_pct: Number(row.deposit_bonus_pct ?? 0),
      withdrawal_fee_pct: Number(row.withdrawal_fee_pct ?? 0),
      withdrawal_conversion_pct: Number(row.withdrawal_conversion_pct ?? 0),
      transfer_fields: parseFields(row.transfer_fields),
      position: Number(row.position ?? 50),
    }));
  });

export interface PaymentMethodDraft {
  payment_method: string;
  label: string;
  instructions: string;
  active: boolean;
  deposit_bonus_pct: number;
  withdrawal_fee_pct: number;
  withdrawal_conversion_pct: number;
  transfer_fields: TransferField[];
}

function normaliseDraft(data: PaymentMethodDraft) {
  if (typeof data?.payment_method !== "string" || data.payment_method.length === 0) {
    throw new Error("No se indicó el método de pago.");
  }
  const fields = (Array.isArray(data.transfer_fields) ? data.transfer_fields : [])
    .slice(0, 8)
    .map((field) => ({
      label: String(field?.label ?? "").trim().slice(0, 40),
      value: String(field?.value ?? "").trim().slice(0, 220),
    }))
    .filter((field) => field.label.length > 0);
  return {
    payment_method: data.payment_method,
    label: String(data.label ?? "").trim().slice(0, 40) || data.payment_method,
    instructions: String(data.instructions ?? "").slice(0, 600),
    active: Boolean(data.active),
    deposit_bonus_pct: Math.max(0, Math.min(500, Number(data.deposit_bonus_pct) || 0)),
    withdrawal_fee_pct: Math.max(0, Math.min(100, Number(data.withdrawal_fee_pct) || 0)),
    withdrawal_conversion_pct: Math.max(0, Math.min(100, Number(data.withdrawal_conversion_pct) || 0)),
    transfer_fields: fields,
  };
}

/** El administrador guarda los datos de transferencia y porcentajes de un método. */
export const savePaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: PaymentMethodDraft) => normaliseDraft(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase as unknown as PaymentSettingsClient, context.userId);
    const { error } = await context.supabase
      .from("payment_settings")
      .update({
        label: data.label,
        instructions: data.instructions,
        active: data.active,
        deposit_bonus_pct: data.deposit_bonus_pct,
        withdrawal_fee_pct: data.withdrawal_fee_pct,
        withdrawal_conversion_pct: data.withdrawal_conversion_pct,
        transfer_fields: data.transfer_fields,
      })
      .eq("payment_method", data.payment_method as DbPaymentMethod);
    if (error) throw new Error("No se pudo guardar el método de pago.");
    return { saved: true };
  });

const DEPOSIT_METHODS = ["saldo_movil", "tarjeta_cup", "usdt", "zelle"] as const;
export type DepositMethod = (typeof DEPOSIT_METHODS)[number];

export interface RequestDepositInput {
  amount: number;
  method: string;
  reference?: string;
  hasProof: boolean;
  destinationId?: string | null;
  transactionId?: string | null;
  senderPhone?: string | null;
  proofPath?: string | null;
}

/**
 * El cliente envía una solicitud de fondos. Solo se aceptan métodos activados
 * por el administrador y el registro lo hace la parte privada de la aplicación.
 * El servidor vuelve a validar importe, destino y datos obligatorios.
 */
export const requestDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: RequestDepositInput) => {
    const amount = Math.round(Number(data?.amount) || 0);
    const method = String(data?.method ?? "");
    if (amount <= 0) throw new Error("Escribe un importe válido.");
    if (!DEPOSIT_METHODS.includes(method as DepositMethod)) {
      throw new Error("Ese método de pago no está disponible.");
    }
    return {
      amount,
      method,
      reference: String(data?.reference ?? "").trim().slice(0, 160),
      hasProof: Boolean(data?.hasProof),
      destinationId: String(data?.destinationId ?? "").trim() || null,
      transactionId: String(data?.transactionId ?? "").trim().slice(0, 80) || null,
      senderPhone: String(data?.senderPhone ?? "").replace(/\D/g, "").slice(0, 15) || null,
      proofPath: String(data?.proofPath ?? "").trim().slice(0, 300) || null,
    };
  })
  .handler(async ({ data, context }) => {
    const { data: settings, error: settingsError } = await context.supabase
      .from("payment_settings")
      .select("active")
      .eq("payment_method", data.method as DbPaymentMethod)
      .maybeSingle();
    if (settingsError) throw new Error("No se pudo verificar el método de pago.");
    if (!settings || !settings.active) {
      throw new Error("Ese método de pago está desactivado por ahora.");
    }
    if (data.proofPath && !data.proofPath.startsWith(`${context.userId}/`)) {
      throw new Error("El comprobante no corresponde a tu cuenta.");
    }

    // Importe mínimo definido por el administrador en la configuración global.
    const { data: platform } = await context.supabase
      .from("platform_settings")
      .select("min_deposit_cup")
      .maybeSingle();
    const minimum = Number(platform?.min_deposit_cup ?? 0);
    if (minimum > 0 && data.amount < minimum) {
      throw new Error(`El importe mínimo para enviar fondos es ${minimum} CUP.`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("request_deposit_v2", {
      p_user: context.userId,
      p_amount: data.amount,
      p_method: data.method as DbPaymentMethod,
      p_reference: data.reference,
      p_has_proof: data.hasProof || Boolean(data.proofPath),
      ...(data.destinationId ? { p_destination: data.destinationId } : {}),
      ...(data.transactionId ? { p_transaction_id: data.transactionId } : {}),
      ...(data.senderPhone ? { p_sender_phone: data.senderPhone } : {}),
      ...(data.proofPath ? { p_proof_url: data.proofPath } : {}),
    });
    if (error) throw new Error(error.message);
    const payload = (result ?? {}) as { line_number?: number | null; line_phone?: string | null };
    return {
      sent: true,
      line_number: payload.line_number ?? null,
      line_phone: payload.line_phone ?? null,
    };
  });


export interface ReviewDepositInput {
  depositId: string;
  approve: boolean;
  reason?: string;
}

/** El administrador aprueba o rechaza una solicitud de fondos. */
export const reviewDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ReviewDepositInput) => {
    const depositId = String(data?.depositId ?? "");
    if (depositId.length === 0) throw new Error("No se indicó la solicitud.");
    return {
      depositId,
      approve: Boolean(data?.approve),
      reason: String(data?.reason ?? "").trim().slice(0, 300),
    };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase as unknown as PaymentSettingsClient, context.userId);
    // Se ejecuta con la sesión del administrador: la función de base de datos
    // vuelve a comprobar el rol real antes de mover dinero.
    const { error } = await context.supabase.rpc("review_deposit", {
      p_deposit: data.depositId,
      p_approve: data.approve,
      p_reason: data.reason,
      p_admin: context.userId,
    });
    if (error) throw new Error(error.message);
    return { reviewed: true };
  });


/** El cliente cobra el premio de referidos cuando completó la barra. */
export const claimReferralReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("claim_referral_reward", {
      p_user: context.userId,
    });
    if (error) throw new Error(error.message);
    return data as { amount: number; balance: number };
  });

// ── Líneas de recepción de saldo móvil ──────────────────────────────────────

export interface PaymentLine {
  id: string;
  payment_method: string;
  line_number: number;
  label: string;
  phone_number: string;
  active: boolean;
  busy: boolean;
  busy_deposit_id: string | null;
  busy_since: string | null;
}

/** Líneas configuradas y si tienen una solicitud pendiente ocupándolas (admin). */
export const listPaymentLines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaymentLine[]> => {
    await requireAdmin(context.supabase as unknown as PaymentSettingsClient, context.userId);
    const { data, error } = await context.supabase
      .from("payment_lines")
      .select("id, payment_method, line_number, label, phone_number, active")
      .order("line_number", { ascending: true });
    if (error) throw new Error("No se pudieron cargar las líneas.");
    const { data: pending } = await context.supabase
      .from("deposits")
      .select("id, line_id, line_assigned_at")
      .eq("status", "pendiente")
      .is("line_released_at", null);
    const busy = new Map<string, { id: string; since: string | null }>();
    for (const row of pending ?? []) {
      if (row.line_id) busy.set(row.line_id, { id: row.id, since: row.line_assigned_at });
    }
    return (data ?? []).map((row) => {
      const hold = busy.get(row.id);
      return {
        id: row.id,
        payment_method: String(row.payment_method),
        line_number: Number(row.line_number),
        label: String(row.label ?? ""),
        phone_number: String(row.phone_number ?? ""),
        active: Boolean(row.active),
        busy: Boolean(hold),
        busy_deposit_id: hold?.id ?? null,
        busy_since: hold?.since ?? null,
      };
    });
  });

export interface PaymentLineDraft {
  id: string;
  label: string;
  phone_number: string;
  active: boolean;
}

/** El administrador cambia el número, el nombre o el estado de una línea. */
export const savePaymentLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: PaymentLineDraft) => {
    const id = String(data?.id ?? "");
    if (id.length === 0) throw new Error("No se indicó la línea.");
    return {
      id,
      label: String(data?.label ?? "").trim().slice(0, 40),
      phone_number: String(data?.phone_number ?? "").replace(/\D/g, "").slice(0, 15),
      active: Boolean(data?.active),
    };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase as unknown as PaymentSettingsClient, context.userId);
    // El servidor valida el móvil cubano, impide duplicados y deja auditoría.
    const { error } = await context.supabase.rpc("admin_save_payment_line", {
      p_line: data.id,
      p_label: data.label,
      p_phone: data.phone_number,
      p_active: data.active,
    });
    if (error) throw new Error(error.message);
    return { saved: true };
  });

/** Política: permitir o no reutilizar una línea con solicitud pendiente. */
export const setLineReusePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { allow: boolean }) => ({ allow: Boolean(data?.allow) }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase as unknown as PaymentSettingsClient, context.userId);
    const { error } = await context.supabase
      .from("platform_settings")
      .update({ allow_line_reuse: data.allow })
      .eq("id", true);
    if (error) throw new Error("No se pudo guardar la política de líneas.");
    return { allow: data.allow };
  });

export interface LinePolicy {
  allow_line_reuse: boolean;
}

export const getLinePolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LinePolicy> => {
    const { data } = await context.supabase
      .from("platform_settings")
      .select("allow_line_reuse")
      .maybeSingle();
    return { allow_line_reuse: Boolean(data?.allow_line_reuse) };
  });

export interface LinePreview {
  available: boolean;
  line_number: number | null;
  phone_number: string;
  label: string;
}

/**
 * Línea que se asignará al cliente si envía la solicitud ahora mismo.
 * Si todas están ocupadas devuelve `available: false`.
 */
export const previewPaymentLine = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { method: string }) => ({ method: String(data?.method ?? "") }))
  .handler(async ({ data, context }): Promise<LinePreview> => {
    const empty: LinePreview = {
      available: false,
      line_number: null,
      phone_number: "",
      label: "",
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lines } = await supabaseAdmin
      .from("payment_lines")
      .select("id, line_number, label, phone_number")
      .eq("payment_method", data.method as DbPaymentMethod)
      .eq("active", true)
      .order("line_number", { ascending: true });
    if (!lines || lines.length === 0) return { ...empty, available: true };

    const { data: pending } = await supabaseAdmin
      .from("deposits")
      .select("line_id")
      .eq("status", "pendiente")
      .is("line_released_at", null);
    const taken = new Set((pending ?? []).map((row) => row.line_id).filter(Boolean));
    const free = lines.find((line) => !taken.has(line.id));
    if (free) {
      return {
        available: true,
        line_number: Number(free.line_number),
        phone_number: String(free.phone_number ?? ""),
        label: String(free.label ?? ""),
      };
    }

    const { data: settings } = await supabaseAdmin
      .from("platform_settings")
      .select("allow_line_reuse")
      .maybeSingle();
    if (settings?.allow_line_reuse) {
      const first = lines[0]!;
      return {
        available: true,
        line_number: Number(first.line_number),
        phone_number: String(first.phone_number ?? ""),
        label: String(first.label ?? ""),
      };
    }
    void context;
    return empty;
  });

/** El administrador libera a mano la línea de una solicitud. */
export const releaseDepositLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { depositId: string; reason?: string }) => {
    const depositId = String(data?.depositId ?? "");
    if (depositId.length === 0) throw new Error("No se indicó la solicitud.");
    return { depositId, reason: String(data?.reason ?? "").trim().slice(0, 300) };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("release_payment_line", {
      p_deposit: data.depositId,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { released: true };
  });

// ── Destinos de pago (Transfermóvil/BANDEC, BPA, Metropolitano, EnZona, iPhone) ──

export interface PaymentDestination {
  id: string;
  channel: string;
  bank: string | null;
  kind: string;
  label: string;
  description: string;
  holder_name: string;
  destination_value: string;
  /** Móvil que el cliente debe dar para confirmar la transferencia. */
  confirm_phone: string;
  instructions: string;
  guide_image_path: string;
  /** Enlace temporal de la imagen educativa, listo para mostrar. */
  guide_image_url: string | null;
  requires_transaction_id: boolean;
  requires_proof: boolean;
  requires_sender_phone: boolean;
  active: boolean;
  position: number;
  updated_at: string;
}

const DESTINATION_COLUMNS =
  "id, channel, bank, kind, label, description, holder_name, destination_value, confirm_phone, instructions, guide_image_path, requires_transaction_id, requires_proof, requires_sender_phone, active, position, updated_at";

export const GUIDE_BUCKET = "payment-guides";

function mapDestination(row: Record<string, unknown>): PaymentDestination {
  return {
    id: String(row["id"]),
    channel: String(row["channel"] ?? ""),
    bank: row["bank"] == null ? null : String(row["bank"]),
    kind: String(row["kind"] ?? "tarjeta"),
    label: String(row["label"] ?? ""),
    description: String(row["description"] ?? ""),
    holder_name: String(row["holder_name"] ?? ""),
    destination_value: String(row["destination_value"] ?? ""),
    confirm_phone: String(row["confirm_phone"] ?? ""),
    instructions: String(row["instructions"] ?? ""),
    guide_image_path: String(row["guide_image_path"] ?? ""),
    guide_image_url: null,
    requires_transaction_id: Boolean(row["requires_transaction_id"]),
    requires_proof: Boolean(row["requires_proof"]),
    requires_sender_phone: Boolean(row["requires_sender_phone"]),
    active: Boolean(row["active"]),
    position: Number(row["position"] ?? 50),
    updated_at: String(row["updated_at"] ?? ""),
  };
}

/** Añade el enlace temporal de cada imagen educativa guardada. */
async function withGuideUrls(
  supabase: {
    storage: {
      from: (bucket: string) => {
        createSignedUrl: (
          path: string,
          expires: number,
        ) => Promise<{ data: { signedUrl: string } | null }>;
      };
    };
  },
  rows: PaymentDestination[],
): Promise<PaymentDestination[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (!row.guide_image_path) return row;
      const { data } = await supabase.storage
        .from(GUIDE_BUCKET)
        .createSignedUrl(row.guide_image_path, 60 * 60);
      return { ...row, guide_image_url: data?.signedUrl ?? null };
    }),
  );
}

/** Destinos activos que el cliente puede elegir. */
export const listPaymentDestinations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaymentDestination[]> => {
    const { data, error } = await context.supabase
      .from("payment_destinations")
      .select(DESTINATION_COLUMNS)
      .eq("active", true)
      .order("position", { ascending: true });
    if (error) throw new Error("No se pudieron cargar los destinos de pago.");
    return withGuideUrls(
      context.supabase as unknown as Parameters<typeof withGuideUrls>[0],
      (data ?? []).map((row) => mapDestination(row as Record<string, unknown>)),
    );
  });

/** Todos los destinos, incluidos los desactivados (panel administrativo). */
export const listAllPaymentDestinations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaymentDestination[]> => {
    await requireAdmin(context.supabase as unknown as PaymentSettingsClient, context.userId);
    const { data, error } = await context.supabase
      .from("payment_destinations")
      .select(DESTINATION_COLUMNS)
      .order("position", { ascending: true });
    if (error) throw new Error("No se pudieron cargar los destinos de pago.");
    return withGuideUrls(
      context.supabase as unknown as Parameters<typeof withGuideUrls>[0],
      (data ?? []).map((row) => mapDestination(row as Record<string, unknown>)),
    );
  });

export interface PaymentDestinationDraft {
  id: string;
  label: string;
  description: string;
  bank: string;
  holder_name: string;
  destination_value: string;
  confirm_phone: string;
  instructions: string;
  requires_transaction_id: boolean;
  requires_proof: boolean;
  active: boolean;
}

const DESTINATION_ERRORS: Record<string, string> = {
  no_admin: "Solo el administrador puede cambiar los datos de pago.",
  no_existe: "Ese destino de pago ya no existe.",
  sin_nombre: "Escribe un nombre para este destino.",
  sin_destino: "Escribe el número o los datos del destino antes de activarlo.",
  formato_invalido: "Ese destino no tiene un formato válido.",
  tarjeta_invalida: "El número de tarjeta debe tener entre 16 y 19 dígitos.",
  monedero_invalido: "El número del monedero debe tener entre 8 y 16 dígitos.",
  movil_invalido: "El móvil a confirmar debe ser un móvil cubano válido (8 dígitos, empieza por 5).",
};

/** El administrador cambia los datos de un destino de pago (con auditoría). */
export const savePaymentDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: PaymentDestinationDraft) => {
    const id = String(data?.id ?? "");
    if (id.length === 0) throw new Error("No se indicó el destino de pago.");
    return {
      id,
      label: String(data?.label ?? "").trim().slice(0, 60),
      description: String(data?.description ?? "").trim().slice(0, 200),
      bank: String(data?.bank ?? "").trim().slice(0, 60),
      holder_name: String(data?.holder_name ?? "").trim().slice(0, 80),
      destination_value: String(data?.destination_value ?? "").trim().slice(0, 120),
      confirm_phone: String(data?.confirm_phone ?? "").replace(/\D/g, "").slice(0, 8),
      instructions: String(data?.instructions ?? "").trim().slice(0, 800),
      requires_transaction_id: Boolean(data?.requires_transaction_id),
      requires_proof: Boolean(data?.requires_proof),
      active: Boolean(data?.active),
    };
  })
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "admin_save_payment_destination",
      {
        p_destination: data.id,
        p_label: data.label,
        p_description: data.description,
        p_bank: data.bank,
        p_holder: data.holder_name,
        p_value: data.destination_value,
        p_confirm_phone: data.confirm_phone,
        p_instructions: data.instructions,
        p_requires_transaction_id: data.requires_transaction_id,
        p_requires_proof: data.requires_proof,
        p_active: data.active,
      },
    );
    if (error) throw new Error("No se pudo guardar el destino de pago.");
    const payload = (result ?? {}) as { ok?: boolean; reason?: string };
    if (!payload.ok) {
      throw new Error(
        DESTINATION_ERRORS[payload.reason ?? ""] ?? "No se pudo guardar el destino de pago.",
      );
    }
    return { saved: true };
  });

/**
 * El administrador guarda (o quita) la imagen educativa de un destino.
 * La imagen ya está subida al almacenamiento; aquí solo se guarda la referencia.
 */
export const setDestinationGuideImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; path: string }) => {
    const id = String(data?.id ?? "");
    if (id.length === 0) throw new Error("No se indicó el destino de pago.");
    return { id, path: String(data?.path ?? "").trim().slice(0, 300) };
  })
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "admin_set_destination_guide_image",
      { p_destination: data.id, p_path: data.path },
    );
    if (error) throw new Error("No se pudo guardar la imagen.");
    const payload = (result ?? {}) as { ok?: boolean; reason?: string };
    if (!payload.ok) {
      throw new Error(
        DESTINATION_ERRORS[payload.reason ?? ""] ?? "No se pudo guardar la imagen.",
      );
    }
    return { saved: true, path: data.path };
  });

/** Número de WhatsApp de atención al cliente configurado por el administrador. */
export const getSupportWhatsapp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ phone: string }> => {
    const { data } = await context.supabase
      .from("platform_settings")
      .select("support_whatsapp")
      .maybeSingle();
    return { phone: String(data?.support_whatsapp ?? "").replace(/\D/g, "") };
  });

export const setSupportWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { phone: string }) => ({
    phone: String(data?.phone ?? "").replace(/\D/g, "").slice(0, 15),
  }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase as unknown as PaymentSettingsClient, context.userId);
    if (data.phone.length < 8) throw new Error("Escribe un número de WhatsApp válido.");
    const { error } = await context.supabase
      .from("platform_settings")
      .update({ support_whatsapp: data.phone })
      .eq("id", true);
    if (error) throw new Error("No se pudo guardar el número de atención al cliente.");
    return { phone: data.phone };
  });

/** Enlace temporal para que el administrador vea la captura de un depósito. */
export const getDepositProofUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { path: string }) => ({ path: String(data?.path ?? "") }))
  .handler(async ({ data, context }): Promise<{ url: string | null }> => {
    if (data.path.length === 0) return { url: null };
    const isOwner = data.path.startsWith(`${context.userId}/`);
    if (!isOwner) {
      await requireAdmin(context.supabase as unknown as PaymentSettingsClient, context.userId);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await supabaseAdmin.storage
      .from("deposit-proofs")
      .createSignedUrl(data.path, 60 * 10);
    return { url: signed?.signedUrl ?? null };
  });
