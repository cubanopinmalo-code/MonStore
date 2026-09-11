import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { UserShell } from "@/components/layout/UserShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mockGames } from "@/data/mock/games";

export const Route = createFileRoute("/app/comercio/publicar")({
  head: () => ({
    meta: [
      { title: "Publicar cuenta — MONSTORE" },
      { name: "description", content: "Publica tu cuenta de videojuego para venderla." },
    ],
  }),
  component: PublishListingPage,
});

function PublishListingPage() {
  return (
    <UserShell>
      <div className="mx-auto max-w-xl space-y-5">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link to="/app/comercio" aria-label="Volver al comercio">
              <ChevronLeft className="size-5" aria-hidden="true" />
            </Link>
          </Button>
          <h1 className="text-xl font-bold">Publicar cuenta</h1>
        </div>

        <form
          className="surface-card space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            toast.success("Publicación enviada (pendiente de revisión)", {
              description: "El equipo la revisará antes de mostrarla en el comercio.",
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="juego">Juego</Label>
            <Select defaultValue={mockGames[0]!.id}>
              <SelectTrigger id="juego">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mockGames.map((game) => (
                  <SelectItem key={game.id} value={game.id}>
                    {game.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título</Label>
            <Input id="titulo" placeholder="Cuenta Free Fire nivel 60 con skins" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea
              id="descripcion"
              rows={5}
              placeholder="Detalla nivel, skins, personajes y cualquier información importante."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="precio">Precio (CUP)</Label>
            <Input id="precio" inputMode="numeric" placeholder="25000" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="imagenes">Imágenes</Label>
            <label
              htmlFor="imagenes"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-sm text-muted-foreground"
            >
              <ImagePlus className="size-4" aria-hidden="true" />
              Sube capturas de la cuenta
            </label>
            <Input id="imagenes" type="file" accept="image/*" multiple className="sr-only" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="extra">Información adicional (opcional)</Label>
            <Textarea id="extra" rows={3} placeholder="Forma de entrega, garantía, etc." />
          </div>

          <Button type="submit" className="w-full">
            Enviar para revisión
          </Button>
          <p className="text-xs text-muted-foreground">
            Todas las publicaciones inician en estado pendiente.
          </p>
        </form>
      </div>
    </UserShell>
  );
}
