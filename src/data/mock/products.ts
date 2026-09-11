import type { Product, ProductField } from "@/types";

const idFields: ProductField[] = [
  {
    key: "player_id",
    label: "ID del jugador",
    placeholder: "Ej. 1234567890",
    type: "text",
    required: true,
  },
];

const idServerFields: ProductField[] = [
  ...idFields,
  {
    key: "server",
    label: "Servidor",
    type: "select",
    options: ["América", "Europa", "Asia"],
    required: true,
  },
];

const idRegionFields: ProductField[] = [
  ...idFields,
  {
    key: "region",
    label: "Región",
    type: "select",
    options: ["LATAM", "NA", "EU"],
    required: true,
  },
  {
    key: "nickname",
    label: "Nickname (opcional)",
    placeholder: "Tu nombre en el juego",
    type: "text",
    required: false,
  },
];

const accountFields: ProductField[] = [
  {
    key: "account_email",
    label: "Correo de la cuenta",
    placeholder: "correo@ejemplo.com",
    type: "text",
    required: true,
  },
  {
    key: "account_data",
    label: "Contraseña o código de acceso",
    placeholder: "Se usa solo para entregar la recarga",
    type: "text",
    required: true,
  },
];

function base(
  id: string,
  game_id: string,
  g2bulk_product_id: string,
  name: string,
  description: string,
  g2bulk_cost: number,
  sale_price: number,
  delivery_method: Product["delivery_method"],
  fields: ProductField[],
  available = true,
  active = true,
): Product {
  return {
    id,
    game_id,
    g2bulk_product_id,
    name,
    description,
    image_url: "",
    g2bulk_cost,
    sale_price,
    currency: "CUP",
    delivery_method,
    active,
    available,
    metadata: { fields },
    last_synced_at: "2026-09-11T06:00:00Z",
    created_at: "2026-01-12T10:00:00Z",
    updated_at: "2026-09-11T06:00:00Z",
  };
}

export const mockProducts: Product[] = [
  base("pr_001", "gm_001", "g2b-ff-100", "100 Diamantes", "Recarga directa por ID de jugador.", 950, 1250, "via_id", idFields),
  base("pr_002", "gm_001", "g2b-ff-310", "310 Diamantes", "Recarga directa por ID de jugador.", 2800, 3600, "via_id", idFields),
  base("pr_003", "gm_001", "g2b-ff-520", "520 Diamantes", "Recarga directa por ID de jugador.", 4600, 5900, "via_id", idFields),
  base("pr_004", "gm_001", "g2b-ff-week", "Membresía semanal", "Se entrega accediendo a la cuenta.", 3100, 4100, "via_cuenta", accountFields, false),
  base("pr_005", "gm_002", "g2b-ml-86", "86 Diamantes", "Recarga por ID y servidor.", 900, 1200, "via_id", idServerFields),
  base("pr_006", "gm_002", "g2b-ml-172", "172 Diamantes", "Recarga por ID y servidor.", 1750, 2300, "via_id", idServerFields),
  base("pr_007", "gm_002", "g2b-ml-pass", "Pase de temporada", "Se entrega accediendo a la cuenta.", 3900, 5100, "via_cuenta", accountFields),
  base("pr_008", "gm_003", "g2b-df-500", "500 Monedas", "Recarga por ID y región.", 1400, 1850, "via_id", idRegionFields),
  base("pr_009", "gm_003", "g2b-df-1200", "1200 Monedas", "Recarga por ID y región.", 3200, 4200, "via_id", idRegionFields),
  base("pr_010", "gm_004", "g2b-fc-500", "500 Puntos FC", "Recarga por ID de jugador.", 1600, 2100, "via_id", idFields),
  base("pr_011", "gm_004", "g2b-fc-1050", "1050 Puntos FC", "Recarga por ID de jugador.", 3300, 4300, "via_id", idFields),
  base("pr_012", "gm_005", "g2b-bs-300", "300 Oro", "Recarga por ID de jugador.", 1100, 1450, "via_id", idFields),
  base("pr_013", "gm_005", "g2b-bs-pass", "Pase de batalla", "Se entrega accediendo a la cuenta.", 2900, 3800, "via_cuenta", accountFields),
  base("pr_014", "gm_006", "g2b-ab-1000", "1000 Bonos", "Producto en mantenimiento.", 2400, 3150, "via_id", idFields, false, false),
];
