import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deliveryLabel, deliveryLongLabel } from "./delivery";

const source = readFileSync("src/lib/catalog.functions.ts", "utf8");

/** Bloques `.update({...})` que la sincronización aplica sobre ofertas existentes. */
function updateBlocks(): string[] {
  const blocks: string[] = [];
  const re = /\.update\(\{([\s\S]*?)\}\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) blocks.push(match[1] ?? "");
  return blocks;
}

describe("protección de precios en la sincronización", () => {
  it("la actualización de ofertas existentes no toca el precio de venta", () => {
    const syncBlocks = updateBlocks().filter((block) => block.includes("g2bulk_cost"));
    expect(syncBlocks.length).toBeGreaterThan(0);
    for (const block of syncBlocks) {
      expect(block).not.toContain("sale_price");
    }
  });

  it("el coste del proveedor sí se actualiza como dato técnico", () => {
    const syncBlocks = updateBlocks().filter((block) => block.includes("g2bulk_cost"));
    expect(syncBlocks.some((block) => block.includes("available"))).toBe(true);
  });
});

describe("clasificación de entregas", () => {
  it("la sincronización nunca crea productos via_cuenta", () => {
    const syncSection = source.slice(source.indexOf("syncProviderCatalog"));
    expect(syncSection).not.toContain('delivery_method: "via_cuenta"');
  });

  it("los productos automáticos con código se clasifican como codigo", () => {
    expect(source).toContain('delivery_method: "codigo"');
  });

  it("las recargas con ID del jugador siguen siendo via_id", () => {
    expect(source).toContain('delivery_method: "via_id" as const');
  });

  it("las etiquetas distinguen los tres tipos", () => {
    expect(deliveryLabel("via_id")).toBe("Por ID");
    expect(deliveryLabel("codigo")).toBe("Por código");
    expect(deliveryLabel("via_cuenta")).toBe("Por cuenta");
    expect(deliveryLongLabel("codigo")).toContain("código");
  });
});

describe("seguridad", () => {
  it("la clave del proveedor no aparece en el catálogo del cliente", () => {
    expect(source).not.toContain("G2BULK_API_KEY");
  });
});
