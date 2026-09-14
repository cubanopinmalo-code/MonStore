import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, ImagePlus, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CardListSkeleton, EmptyState } from "@/components/common/states";
import {
  deleteProduct,
  listGamesAdmin,
  listProductsAdmin,
  saveProduct,
  uploadCatalogImage,
  type CatalogProduct,
  type ProductDraft,
} from "@/lib/catalog.functions";
import { formatCUP } from "@/lib/format";
import { deliveryLabel } from "@/lib/delivery";

type OfferRow = CatalogProduct & { game_name: string };

const PAGE_SIZE = 25;

function fieldsOf(product: CatalogProduct): string[] {
  const meta = product.metadata as { fields?: unknown } | null;
  return Array.isArray(meta?.fields) ? (meta?.fields as unknown[]).map(String) : [];
}

function toTextList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toDraft(product: OfferRow): ProductDraft {
  return {
    id: product.id,
    game_id: product.game_id,
    name: product.name,
    description: product.description,
    g2bulk_product_id: product.g2bulk_product_id,
    g2bulk_cost: product.g2bulk_cost,
    sale_price: product.sale_price,
    currency: product.currency,
    delivery_method: product.delivery_method,
    active: true,
    available: product.available,
    image_url: product.image_url,
    fields: fieldsOf(product),
  };
}

export const Route = createFileRoute("/_authenticated/admin/productos")({
  head: () => ({
    meta: [
      { title: "Ofertas — Panel MONSTORE" },
      {
        name: "description",
        content:
          "Revisa el costo del proveedor y ajusta el precio de venta en CUP.",
      },
      { property: "og:title", content: "Ofertas — Panel MONSTORE" },
      {
        property: "og:description",
        content: "Precios, disponibilidad y entrega de cada oferta de MONSTORE.",
      },
    ],
  }),
  component: AdminProductsPage,
});

function AdminProductsPage() {
  const queryClient = useQueryClient();
  const fetchOffers = useServerFn(listProductsAdmin);
  const fetchGames = useServerFn(listGamesAdmin);
  const save = useServerFn(saveProduct);
  const remove = useServerFn(deleteProduct);
  const upload = useServerFn(uploadCatalogImage);

  const offers = useQuery({ queryKey: ["admin-products"], queryFn: () => fetchOffers() });
  const games = useQuery({ queryKey: ["admin-games"], queryFn: () => fetchGames() });

  const [search, setSearch] = useState("");
  const [gameFilter, setGameFilter] = useState("todas");
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const rows = offers.data ?? [];
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (gameFilter !== "todas" && row.game_id !== gameFilter) return false;
      if (!term) return true;
      return (
        row.name.toLowerCase().includes(term) ||
        row.game_name.toLowerCase().includes(term) ||
        row.g2bulk_product_id.toLowerCase().includes(term)
      );
    });
  }, [offers.data, search, gameFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      await save({ data: draft });
      toast.success(draft.id ? "Oferta actualizada." : "Oferta creada.");
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la oferta.");
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickSave(product: OfferRow, changes: Partial<ProductDraft>) {
    try {
      await save({ data: { ...toDraft(product), ...changes } });
      await queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el cambio.");
    }
  }

  async function handleRemove(product: OfferRow) {
    try {
      await remove({ data: { id: product.id } });
      toast.success("Oferta eliminada.");
      await queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar la oferta.");
    }
  }

  async function handleImage(file: File | undefined) {
    if (!file || !draft) return;
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
      reader.readAsDataURL(file);
    }).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : "No se pudo leer la imagen.");
      return "";
    });
    if (!base64) return;

    setSaving(true);
    try {
      const result = await upload({ data: { name: file.name, mime: file.type, base64 } });
      setDraft({ ...draft, image_url: result.path });
      toast.success("Imagen subida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo subir la imagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell
      title="Ofertas"
      description="El costo del proveedor viene en dólares; el precio de venta lo pones tú en CUP."
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="Buscar oferta, juego o referencia"
            className="pl-9"
          />
        </div>
        <Select
          value={gameFilter}
          onValueChange={(value) => {
            setGameFilter(value);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Juego" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todos los juegos</SelectItem>
            {(games.data ?? []).map((game) => (
              <SelectItem key={game.id} value={game.id}>
                {game.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {offers.isPending ? <CardListSkeleton items={6} /> : null}

      {offers.isError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las ofertas.
        </p>
      ) : null}

      {!offers.isPending && filtered.length === 0 ? (
        <EmptyState
          title="No hay ofertas que mostrar"
          description="Sincroniza el catálogo desde la pantalla del proveedor o crea una oferta a mano."
        />
      ) : null}

      {rows.length > 0 ? (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Oferta</TableHead>
                <TableHead>Juego</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead>Costo proveedor</TableHead>
                <TableHead>Venta</TableHead>
                <TableHead>Disponible</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">
                    {product.name}
                    <span className="block text-xs text-muted-foreground">
                      {product.g2bulk_product_id}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">{product.game_name || "—"}</TableCell>
                  <TableCell className="text-xs">
                    {deliveryLabel(product.delivery_method)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    USD {product.g2bulk_cost.toFixed(2)}
                  </TableCell>
                  <TableCell>{formatCUP(product.sale_price)}</TableCell>
                  <TableCell>
                    <StatusBadge status={product.available ? "disponible" : "no disponible"} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDraft(toDraft(product))}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                        Editar
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Eliminar oferta">
                            <Trash2 className="size-4" aria-hidden="true" />
                            <span className="sr-only">Eliminar</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminar {product.name}</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta acción no se puede deshacer. Los pedidos ya realizados se
                              conservan.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRemove(product)}>
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {filtered.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {filtered.length} ofertas · página {safePage + 1} de {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              <span className="sr-only">Página anterior</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
              <span className="sr-only">Página siguiente</span>
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar oferta" : "Nueva oferta"}</DialogTitle>
            <DialogDescription>
              Si dejas el precio en cero, la oferta no se podrá vender aunque esté visible.
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="offer-name">Nombre</Label>
                <Input
                  id="offer-name"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="60 diamantes"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="offer-game">Juego</Label>
                  <Select
                    value={draft.game_id}
                    onValueChange={(value) => setDraft({ ...draft, game_id: value })}
                  >
                    <SelectTrigger id="offer-game">
                      <SelectValue placeholder="Elige el juego" />
                    </SelectTrigger>
                    <SelectContent>
                      {(games.data ?? []).map((game) => (
                        <SelectItem key={game.id} value={game.id}>
                          {game.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="offer-delivery">Entrega</Label>
                  <Select
                    value={draft.delivery_method}
                    onValueChange={(value) =>
                      setDraft({
                        ...draft,
                        delivery_method: value === "via_id" ? "via_id" : "codigo",
                      })
                    }
                  >
                    <SelectTrigger id="offer-delivery">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="via_id">Vía ID (directa)</SelectItem>
                      <SelectItem value="codigo">Código o tarjeta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="offer-cost">Costo del proveedor (USD)</Label>
                  <Input
                    id="offer-cost"
                    type="number"
                    step="0.01"
                    value={draft.g2bulk_cost}
                    onChange={(event) =>
                      setDraft({ ...draft, g2bulk_cost: Number(event.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="offer-price">Precio de venta (CUP)</Label>
                  <Input
                    id="offer-price"
                    type="number"
                    step="1"
                    value={draft.sale_price}
                    onChange={(event) =>
                      setDraft({ ...draft, sale_price: Number(event.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="offer-fields">Datos que pide al cliente (separados por coma)</Label>
                <Input
                  id="offer-fields"
                  value={draft.fields.join(", ")}
                  onChange={(event) => setDraft({ ...draft, fields: toTextList(event.target.value) })}
                  placeholder="user_id, server_id"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="offer-description">Descripción</Label>
                <Textarea
                  id="offer-description"
                  rows={2}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="offer-image">Imagen</Label>
                <Input
                  id="offer-image"
                  value={draft.image_url}
                  onChange={(event) => setDraft({ ...draft, image_url: event.target.value })}
                  placeholder="Ruta subida o dirección de imagen"
                />
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
                    <ImagePlus className="size-4" aria-hidden="true" />
                    Subir imagen
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        void handleImage(file);
                      }}
                    />
                  </label>
                  <span className="text-xs text-muted-foreground">JPG, PNG o WEBP hasta 4 MB</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={draft.available}
                    onCheckedChange={(checked) => setDraft({ ...draft, available: checked })}
                  />
                  Con existencias
                </label>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
