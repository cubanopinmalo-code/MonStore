import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Centro de operaciones de fondos (solo administración).
 * Todas las lecturas y acciones se validan de nuevo en el servidor: se comprueba
 * el rol real del usuario y el estado de la solicitud antes de tocar dinero.
 */

interface AdminContext {
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  userId: string;
}

async function requireAdmin(context: AdminContext): Promise<void> {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("No se pudo verificar tu permiso.");
  if (!data) throw new Error("Solo el administrador puede gestionar los fondos.");
}

export interface FundsPerson {
  user_id: string;
  name: string;
  phone: string;
  avatar: string | null;
}

export interface DepositRequestRow extends FundsPerson {
  id: string;
  amount: number;
  credited_amount: number;
  payment_method: string;
  payment_channel: string | null;
  bank: string | null;
  destination_value: string | null;
  transaction_id: string | null;
  sender_phone: string | null;
  proof_image_url: string | null;
  payment_reference: string;
  line_number: number | null;
  line_phone: string | null;
  line_assigned_at: string | null;
  line_released_at: string | null;
  status: string;
  flow_status: string;
  created_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
}

export interface WithdrawalRequestRow extends FundsPerson {
  id: string;
  amount: number;
  fee: number;
  fee_pct: number;
  net_amount: number;
  held_amount: number;
  payment_method: string;
  payment_destination: string;
  line_number: number | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  processed_at: string | null;
  transaction_id: string | null;
  rejection_reason: string | null;
}

export interface FundsLine {
  id: string;
  line_number: number;
  label: string;
  phone_number: string;
  active: boolean;
  /** Tiene una solicitud vinculada sin resolver, por lo que no se reasigna. */
  busy: boolean;
  max_pending_amount: number | null;
  pending_count: number;
  pending_amount: number;
  processed_count: number;
  processed_amount: number;
  future_amount: number;
  capacity_left: number | null;
  progress: number;
}

export interface FundsOverview {
  server_now: string;
  deposits: DepositRequestRow[];
  withdrawals: WithdrawalRequestRow[];
  lines: FundsLine[];
  totals: {
    deposits_pending: number;
    deposits_amount: number;
    deposits_late: number;
    withdrawals_pending: number;
    withdrawals_amount: number;
    withdrawals_net: number;
    withdrawals_fee: number;
    held_funds: number;
    client_balances: number;
    lines_pending_amount: number;
    lines_processed_amount: number;
  };
}

const DAY = 24 * 60 * 60 * 1000;

/** Solicitudes pendientes, estado de las líneas y totales, con datos reales. */
export const getFundsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FundsOverview> => {
    await requireAdmin(context as unknown as AdminContext);
    const db = context.supabase;

    const [deposits, withdrawals, lines, wallets, doneDeposits] = await Promise.all([
      db
        .from("deposits")
        .select("*")
        .eq("status", "pendiente")
        .order("created_at", { ascending: true })
        .limit(300),
      db
        .from("withdrawals")
        .select("*")
        .eq("status", "pendiente")
        .order("created_at", { ascending: true })
        .limit(300),
      db
        .from("payment_lines")
        .select("id, line_number, label, phone_number, active, payment_method, max_pending_amount")
        .order("line_number", { ascending: true }),
      db.from("wallets").select("balance, held_balance"),
      db
        .from("deposits")
        .select("amount, credited_amount, line_number, status, reviewed_at")
        .eq("status", "aprobado")
        .gte("reviewed_at", new Date(Date.now() - 30 * DAY).toISOString())
        .limit(1000),
    ]);

    const depositRows = deposits.data ?? [];
    const withdrawalRows = withdrawals.data ?? [];
    const ids = [
      ...new Set([...depositRows.map((row) => row.user_id), ...withdrawalRows.map((row) => row.user_id)]),
    ];
    const people = new Map<string, { name: string; phone: string; avatar: string | null }>();
    if (ids.length > 0) {
      const { data } = await db.from("profiles").select("id, name, phone, avatar").in("id", ids);
      for (const row of data ?? []) {
        people.set(row.id, {
          name: String(row.name ?? "") || String(row.phone ?? "") || "Cliente",
          phone: String(row.phone ?? ""),
          avatar: row.avatar ?? null,
        });
      }
    }
    const person = (userId: string): FundsPerson => ({
      user_id: userId,
      name: people.get(userId)?.name ?? "Cliente",
      phone: people.get(userId)?.phone ?? "",
      avatar: people.get(userId)?.avatar ?? null,
    });

    const depositList: DepositRequestRow[] = depositRows.map((row) => ({
      ...person(row.user_id),
      id: row.id,
      amount: Number(row.amount ?? 0),
      credited_amount: Number(row.credited_amount ?? 0),
      payment_method: String(row.payment_method),
      payment_channel: row.payment_channel ?? null,
      bank: row.bank ?? null,
      destination_value: row.destination_value ?? null,
      transaction_id: row.transaction_id ?? null,
      sender_phone: row.sender_phone ?? null,
      proof_image_url: row.proof_image_url ?? null,
      payment_reference: String(row.payment_reference ?? ""),
      line_number: row.line_number ?? null,
      line_phone: row.line_phone ?? null,
      line_assigned_at: row.line_assigned_at ?? null,
      line_released_at: row.line_released_at ?? null,
      status: String(row.status),
      flow_status: String(row.flow_status ?? ""),
      created_at: String(row.created_at),
      reviewed_at: row.reviewed_at ?? null,
      rejection_reason: row.rejection_reason ?? null,
    }));

    const withdrawalList: WithdrawalRequestRow[] = withdrawalRows.map((row) => ({
      ...person(row.user_id),
      id: row.id,
      amount: Number(row.amount ?? 0),
      fee: Number(row.fee ?? 0),
      fee_pct: Number(row.fee_pct ?? 0),
      net_amount: Number(row.net_amount ?? 0),
      held_amount: Number(row.held_amount ?? 0),
      payment_method: String(row.payment_method),
      payment_destination: String(row.payment_destination ?? ""),
      line_number: row.line_number ?? null,
      status: String(row.status),
      created_at: String(row.created_at),
      reviewed_at: row.reviewed_at ?? null,
      processed_at: row.processed_at ?? null,
      transaction_id: row.transaction_id ?? null,
      rejection_reason: row.rejection_reason ?? null,
    }));

    // Las líneas son configuración dinámica: se muestran todas las registradas.
    const saldoLines = (lines.data ?? [])
      .filter((row) => row.payment_method === "saldo_movil")
      .sort((a, b) => Number(a.line_number) - Number(b.line_number));
    const lineList: FundsLine[] = saldoLines.map((config) => {
      const lineNumber = Number(config.line_number);
      const pending = depositList.filter(
        (row) => row.payment_method === "saldo_movil" && row.line_number === lineNumber,
      );
      const processed = (doneDeposits.data ?? []).filter((row) => row.line_number === lineNumber);
      const pendingAmount = pending.reduce((total, row) => total + row.amount, 0);
      const processedAmount = processed.reduce((total, row) => total + Number(row.amount ?? 0), 0);
      const max = config?.max_pending_amount == null ? null : Number(config.max_pending_amount);
      return {
        id: String(config.id),
        line_number: lineNumber,
        label: String(config?.label ?? `Línea ${lineNumber}`),
        phone_number: String(config?.phone_number ?? ""),
        active: Boolean(config?.active),
        // Ocupada: hay una solicitud vinculada aún sin resolver.
        busy: pending.length > 0,
        max_pending_amount: max,
        pending_count: pending.length,
        pending_amount: pendingAmount,
        processed_count: processed.length,
        processed_amount: processedAmount,
        future_amount: processedAmount + pendingAmount,
        capacity_left: max == null ? null : Math.max(max - pendingAmount, 0),
        progress: max == null || max <= 0 ? 0 : Math.min(Math.round((pendingAmount / max) * 100), 100),
      };
    });

    const walletRows = wallets.data ?? [];
    const now = Date.now();

    return {
      server_now: new Date(now).toISOString(),
      deposits: depositList,
      withdrawals: withdrawalList,
      lines: lineList,
      totals: {
        deposits_pending: depositList.length,
        deposits_amount: depositList.reduce((total, row) => total + row.amount, 0),
        deposits_late: depositList.filter((row) => now - new Date(row.created_at).getTime() > DAY).length,
        withdrawals_pending: withdrawalList.length,
        withdrawals_amount: withdrawalList.reduce((total, row) => total + row.amount, 0),
        withdrawals_net: withdrawalList.reduce((total, row) => total + row.net_amount, 0),
        withdrawals_fee: withdrawalList.reduce((total, row) => total + row.fee, 0),
        held_funds: walletRows.reduce((total, row) => total + Number(row.held_balance ?? 0), 0),
        client_balances: walletRows.reduce((total, row) => total + Number(row.balance ?? 0), 0),
        lines_pending_amount: lineList.reduce((total, row) => total + row.pending_amount, 0),
        lines_processed_amount: lineList.reduce((total, row) => total + row.processed_amount, 0),
      },
    };
  });

export interface FundsHistoryRow {
  id: string;
  kind: "deposito" | "retiro";
  user_id: string;
  user_name: string;
  user_phone: string;
  amount: number;
  net_amount: number;
  fee: number;
  method: string;
  line_number: number | null;
  status: string;
  note: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  admin_name: string;
}

export interface FundsHistoryFilters {
  kind?: "todos" | "deposito" | "retiro";
  status?: string;
  method?: string;
  line?: string;
  search?: string;
  from?: string;
  to?: string;
}

/** Historial de operaciones ya revisadas, con filtros. Nunca mezcla pendientes. */
export const getFundsHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: FundsHistoryFilters) => ({
    kind: (data?.kind ?? "todos") as "todos" | "deposito" | "retiro",
    status: String(data?.status ?? "todos"),
    method: String(data?.method ?? "todos"),
    line: String(data?.line ?? "todas"),
    search: String(data?.search ?? "").trim().slice(0, 60),
    from: String(data?.from ?? ""),
    to: String(data?.to ?? ""),
  }))
  .handler(async ({ data, context }): Promise<FundsHistoryRow[]> => {
    await requireAdmin(context as unknown as AdminContext);
    const db = context.supabase;

    const wantDeposits = data.kind === "todos" || data.kind === "deposito";
    const wantWithdrawals = data.kind === "todos" || data.kind === "retiro";

    let depositQuery = db
      .from("deposits")
      .select(
        "id, user_id, amount, credited_amount, payment_method, line_number, status, rejection_reason, created_at, reviewed_at, reviewed_by",
      )
      .neq("status", "pendiente")
      .order("reviewed_at", { ascending: false })
      .limit(300);
    let withdrawalQuery = db
      .from("withdrawals")
      .select(
        "id, user_id, amount, net_amount, fee, payment_method, line_number, status, rejection_reason, created_at, reviewed_at, reviewed_by, processed_at, transaction_id",
      )
      .neq("status", "pendiente")
      .order("reviewed_at", { ascending: false })
      .limit(300);

    if (data.status !== "todos") {
      const status = (data.status === "completado" ? "aprobado" : data.status) as
        | "pendiente"
        | "aprobado"
        | "rechazado";
      depositQuery = depositQuery.eq("status", status);
      withdrawalQuery = withdrawalQuery.eq("status", status);
    }

    if (data.from.length > 0) {
      depositQuery = depositQuery.gte("created_at", data.from);
      withdrawalQuery = withdrawalQuery.gte("created_at", data.from);
    }
    if (data.to.length > 0) {
      depositQuery = depositQuery.lte("created_at", data.to);
      withdrawalQuery = withdrawalQuery.lte("created_at", data.to);
    }

    const [deposits, withdrawals] = await Promise.all([
      wantDeposits ? depositQuery : Promise.resolve({ data: [] as never[] }),
      wantWithdrawals ? withdrawalQuery : Promise.resolve({ data: [] as never[] }),
    ]);

    const depositRows = (deposits.data ?? []) as Record<string, unknown>[];
    const withdrawalRows = (withdrawals.data ?? []) as Record<string, unknown>[];

    const ids = [
      ...new Set(
        [...depositRows, ...withdrawalRows]
          .flatMap((row) => [row["user_id"], row["reviewed_by"]])
          .filter((value): value is string => typeof value === "string"),
      ),
    ];
    const people = new Map<string, { name: string; phone: string }>();
    if (ids.length > 0) {
      const { data: profiles } = await db.from("profiles").select("id, name, phone").in("id", ids);
      for (const row of profiles ?? []) {
        people.set(row.id, {
          name: String(row.name ?? "") || String(row.phone ?? "") || "Cliente",
          phone: String(row.phone ?? ""),
        });
      }
    }

    const rows: FundsHistoryRow[] = [
      ...depositRows.map((row) => ({
        id: String(row["id"]),
        kind: "deposito" as const,
        user_id: String(row["user_id"]),
        user_name: people.get(String(row["user_id"]))?.name ?? "Cliente",
        user_phone: people.get(String(row["user_id"]))?.phone ?? "",
        amount: Number(row["amount"] ?? 0),
        net_amount: Number(row["credited_amount"] ?? 0),
        fee: 0,
        method: String(row["payment_method"] ?? ""),
        line_number: row["line_number"] == null ? null : Number(row["line_number"]),
        status: String(row["status"]),
        note: String(row["rejection_reason"] ?? ""),
        created_at: String(row["created_at"]),
        reviewed_at: row["reviewed_at"] == null ? null : String(row["reviewed_at"]),
        reviewed_by: row["reviewed_by"] == null ? null : String(row["reviewed_by"]),
        admin_name:
          row["reviewed_by"] == null
            ? "—"
            : (people.get(String(row["reviewed_by"]))?.name ?? "Administración"),
      })),
      ...withdrawalRows.map((row) => ({
        id: String(row["id"]),
        kind: "retiro" as const,
        user_id: String(row["user_id"]),
        user_name: people.get(String(row["user_id"]))?.name ?? "Cliente",
        user_phone: people.get(String(row["user_id"]))?.phone ?? "",
        amount: Number(row["amount"] ?? 0),
        net_amount: Number(row["net_amount"] ?? 0),
        fee: Number(row["fee"] ?? 0),
        method: String(row["payment_method"] ?? ""),
        line_number: row["line_number"] == null ? null : Number(row["line_number"]),
        status: row["status"] === "aprobado" ? "completado" : String(row["status"]),
        note: String(row["rejection_reason"] ?? ""),
        created_at: String(row["created_at"]),
        reviewed_at: row["reviewed_at"] == null ? null : String(row["reviewed_at"]),
        reviewed_by: row["reviewed_by"] == null ? null : String(row["reviewed_by"]),
        admin_name:
          row["reviewed_by"] == null
            ? "—"
            : (people.get(String(row["reviewed_by"]))?.name ?? "Administración"),
      })),
    ];

    const search = data.search.toLowerCase();
    return rows
      .filter((row) => (data.method === "todos" ? true : row.method === data.method))
      .filter((row) => (data.line === "todas" ? true : String(row.line_number ?? "") === data.line))
      .filter((row) =>
        search.length === 0
          ? true
          : row.user_name.toLowerCase().includes(search) ||
            row.user_phone.includes(search) ||
            row.admin_name.toLowerCase().includes(search),
      )
      .sort((a, b) => ((a.reviewed_at ?? a.created_at) < (b.reviewed_at ?? b.created_at) ? 1 : -1));
  });

/** El administrador marca un retiro como completado (pagado). Es idempotente. */
export const completeWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { withdrawalId: string; transactionId?: string; note?: string }) => {
    const withdrawalId = String(data?.withdrawalId ?? "");
    if (withdrawalId.length === 0) throw new Error("No se indicó el retiro.");
    return {
      withdrawalId,
      transactionId: String(data?.transactionId ?? "").trim().slice(0, 80),
      note: String(data?.note ?? "").trim().slice(0, 300),
    };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as AdminContext);
    const { data: result, error } = await context.supabase.rpc("complete_withdrawal", {
      p_withdrawal: data.withdrawalId,
      ...(data.transactionId.length > 0 ? { p_transaction_id: data.transactionId } : {}),
      p_note: data.note,
    });

    if (error) throw new Error(error.message);
    const payload = (result ?? {}) as { changed?: boolean; status?: string };
    return { completed: true, changed: payload.changed !== false, status: payload.status ?? "aprobado" };
  });

/** El administrador rechaza un retiro con motivo obligatorio y devuelve el dinero. */
export const rejectWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { withdrawalId: string; reason: string }) => {
    const withdrawalId = String(data?.withdrawalId ?? "");
    const reason = String(data?.reason ?? "").trim().slice(0, 300);
    if (withdrawalId.length === 0) throw new Error("No se indicó el retiro.");
    if (reason.length < 3) throw new Error("Escribe el motivo del rechazo.");
    return { withdrawalId, reason };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as AdminContext);
    const { data: result, error } = await context.supabase.rpc("review_withdrawal", {
      p_withdrawal: data.withdrawalId,
      p_approve: false,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    const payload = (result ?? {}) as { changed?: boolean; status?: string };
    return { rejected: true, changed: payload.changed !== false, status: payload.status ?? "rechazado" };
  });
