import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ChevronLeft, Eye, EyeOff, ImagePlus, LockKeyhole } from "lucide-react";
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
import { getAccessMethods } from "@/lib/accountAccess";

export const Route = createFileRoute("/_authenticated/app/comercio/publicar")({
  head: () => ({
    meta: [
      { title: "Publicar cuenta — MONSTORE" },
      { name: "description", content: "Publica tu cuenta de videojuego para venderla." },
      { property: "og:title", content: "Publicar cuenta — MONSTORE" },
      { property: "og:description", content: "Envía una cuenta de videojuego para revisión." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublishListingPage,
});

function PublishListingPage() {
  const availableGames = mockGames.filter((game) => game.active);
  const initialGameId = availableGames[0]?.id ?? "";
  const [gameId, setGameId] = useState(initialGameId);
  const [showPassword, setShowPassword] = useState(false);
  const [region, setRegion] = useState("Latinoamérica");
  const [platform, setPlatform] = useState("");
  const [imageCount, setImageCount] = useState(0);
  const [imageError, setImageError] = useState(false);
  const selectedGame = availableGames.find((game) => game.id === gameId);
  const platforms = getAccessMethods(selectedGame?.name);

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
            if (!gameId || !region || !platform) {
              toast.error("Completa el juego, la región y la plataforma de acceso");
              return;
            }
            if (imageCount < 1) {
              setImageError(true);
              toast.error("Debes enviar al menos 1 foto de la cuenta");
              return;
            }
            setImageError(false);
            toast.success("Publicación enviada (pendiente de revisión)", {
              description: "El equipo la revisará antes de mostrarla en el comercio.",
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="juego">
              Juego <span className="text-destructive">*</span>
            </Label>
            <Select
              value={gameId}
              onValueChange={(value) => {
                setGameId(value);
                setPlatform("");
              }}
            >
              <SelectTrigger id="juego">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableGames.map((game) => (
                  <SelectItem key={game.id} value={game.id}>
                    {game.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="precio">Precio (CUP)</Label>
            <Input id="precio" inputMode="numeric" placeholder="25000" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="region">
              Región de la cuenta <span className="text-destructive">*</span>
            </Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger id="region"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Latinoamérica", "Norteamérica", "Europa", "Brasil", "Asia"].map((region) => (
                  <SelectItem key={region} value={region}>{region}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plataforma">
              Plataforma de acceso <span className="text-destructive">*</span>
            </Label>
            <Select
              value={platforms.includes(platform) ? platform : (platforms[0] ?? "")}
              onValueChange={setPlatform}
            >
              <SelectTrigger id="plataforma"><SelectValue /></SelectTrigger>
              <SelectContent>
                {platforms.map((platform) => (
                  <SelectItem key={platform} value={platform}>{platform}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Opciones según el juego seleccionado{selectedGame ? `: ${selectedGame.name}` : ""}.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="imagenes">
              Imágenes <span className="text-destructive">*</span>
            </Label>
            <label
              htmlFor="imagenes"
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-sm ${
                imageError
                  ? "border-destructive text-destructive"
                  : "border-border text-muted-foreground"
              }`}
            >
              <ImagePlus className="size-4" aria-hidden="true" />
              {imageCount > 0
                ? `${imageCount} imagen(es) seleccionada(s)`
                : "Selecciona la foto principal y las demás imágenes"}
            </label>
            <Input
              id="imagenes"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const count = event.target.files?.length ?? 0;
                setImageCount(count);
                if (count > 0) setImageError(false);
              }}
            />
            {imageError ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                Debes enviar al menos 1 foto antes de mandar la cuenta a revisión.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">La primera imagen será la foto principal pública.</p>
          </div>

          <div className="space-y-4 rounded-md border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-2">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold">Datos privados</h2>
                <p className="text-xs text-muted-foreground">Solo serán visibles para el panel administrador.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="correo-cuenta">Correo de la cuenta</Label>
              <Input id="correo-cuenta" type="email" autoComplete="off" placeholder="cuenta@ejemplo.com" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contrasena-cuenta">Contraseña de la cuenta</Label>
              <div className="relative">
                <Input id="contrasena-cuenta" type={showPassword ? "text" : "password"} autoComplete="new-password" className="pr-10" required />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acceso-admin">Descripción extra para acceder</Label>
              <Textarea id="acceso-admin" rows={3} placeholder="Indica método de acceso, códigos o pasos que necesitará el administrador." required />
            </div>
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
