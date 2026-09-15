import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, Clock, Eye, EyeOff, ImagePlus, LockKeyhole } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useWallet } from "@/hooks/useAccount";
import {
  DEFAULT_LISTING_FEE_PER_DAY,
  feeForDays,
  useActiveGames,
  useListingFee,
} from "@/hooks/useMarketplace";
import { usePlatformFlags } from "@/hooks/usePlatformFlags";
import { getAccessMethods } from "@/lib/accountAccess";
import { formatCUP } from "@/lib/format";

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

const DAY_OPTIONS = [1, 2, 3, 4, 5];

/** Únicos juegos que se pueden publicar en el comercio de cuentas. */
const LISTABLE_GAMES = ["Free Fire", "Blood Strike", "Call of Duty", "DLS26", "Neo Monster"];

function PublishListingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: wallet } = useWallet();
  const { data: games } = useActiveGames();
  const { data: feePerDay } = useListingFee();
  const { data: flags } = usePlatformFlags();

  const availableGames = (games ?? []).filter((game) => LISTABLE_GAMES.includes(game.name));
  const [gameId, setGameId] = useState("");
  const [price, setPrice] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [region, setRegion] = useState("Latinoamérica");
  const [platform, setPlatform] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [imageError, setImageError] = useState(false);
  const [days, setDays] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);

  const selectedGame = availableGames.find((game) => game.id === gameId);
  const platforms = getAccessMethods(selectedGame?.name);
  const dailyFee = feePerDay?.perDay ?? DEFAULT_LISTING_FEE_PER_DAY;
  const total = feeForDays(feePerDay, days);
  const balance = Number(wallet?.balance ?? 0);
  const canPay = balance >= total;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    if (!gameId || !region || !platform) {
      toast.error("Completa el juego, la región y la plataforma de acceso");
      return;
    }
    if (files.length < 1) {
      setImageError(true);
      toast.error("Debes enviar al menos 1 foto de la cuenta");
      return;
    }
    if (!canPay) {
      toast.error("No tienes saldo suficiente para publicar", {
        description: `Necesitas ${formatCUP(total)} por ${days} día(s).`,
      });
      navigate({ to: "/app/wallet/depositar", search: { necesario: total, metodo: "movil" } });
      return;
    }
    setImageError(false);
    setSending(true);

    const paths: string[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("listings")
        .upload(path, file, { contentType: file.type });
      if (error) {
        setSending(false);
        toast.error("No pudimos subir las fotos", { description: error.message });
        return;
      }
      paths.push(path);
    }

    const { data, error } = await supabase.rpc("publish_game_account", {
      p_game: gameId,
      p_title: `Cuenta en venta de ${selectedGame?.name ?? "videojuego"}`,
      p_price: Number(price),
      p_region: region,
      p_platform: platform,
      p_images: paths,
      p_days: days,
      p_email: email,
      p_password: password,
      p_notes: notes,
    });
    setSending(false);

    if (error) {
      toast.error("No pudimos enviar la publicación", { description: error.message });
      return;
    }

    const charged = Number((data as { total?: number } | null)?.total ?? total);
    await queryClient.invalidateQueries();
    toast.success(`Cuenta enviada a revisión — se descontaron ${formatCUP(charged)}`, {
      description: `Al ser aprobada, tu cuenta será publicada por ${days * 24} horas para que todos los que usan la app la vean. ¡Buena suerte con la venta!`,
    });
    void navigate({ to: "/app/comercio/mis-publicaciones" });
  }

  if (flags?.marketplaceEnabled === false) {
    return (
      <UserShell>
        <section className="surface-card mx-auto max-w-lg space-y-3 p-6 text-center">
          <LockKeyhole className="mx-auto size-8 text-primary" aria-hidden="true" />
          <h1 className="font-display text-xl font-bold">Publicaciones cerradas</h1>
          <p className="text-sm text-muted-foreground">
            El comercio de cuentas está desactivado temporalmente, así que no se pueden publicar
            cuentas nuevas. Tus publicaciones anteriores no cambian.
          </p>
        </section>
      </UserShell>
    );
  }

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

        <form className="surface-card space-y-4 p-5" onSubmit={handleSubmit}>
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
                <SelectValue placeholder="Selecciona el juego" />
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
            <Input
              id="precio"
              inputMode="numeric"
              placeholder="25000"
              required
              value={price}
              onChange={(event) => setPrice(event.target.value.replace(/[^\d]/g, ""))}
            />
            <p className="text-xs text-muted-foreground">
              El precio que le pongas a tu cuenta importa: si estás exagerando, nadie te la
              compraría. Trata de no sobrevalorar tu cuenta.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="region">
              Región de la cuenta <span className="text-destructive">*</span>
            </Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger id="region"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Latinoamérica", "Norteamérica", "Europa", "Brasil", "Asia"].map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plataforma">
              Plataforma de acceso <span className="text-destructive">*</span>
            </Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger id="plataforma">
                <SelectValue placeholder="Selecciona la plataforma" />
              </SelectTrigger>
              <SelectContent>
                {platforms.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
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
              {files.length > 0
                ? `${files.length} imagen(es) seleccionada(s)`
                : "Selecciona la foto principal y las demás imágenes"}
            </label>
            <Input
              id="imagenes"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const list = Array.from(event.target.files ?? []);
                setFiles(list);
                if (list.length > 0) setImageError(false);
              }}
            />
            {imageError ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                Debes enviar al menos 1 foto antes de mandar la cuenta a revisión.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">La primera imagen será la foto principal pública.</p>
          </div>

          <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold">Tiempo de publicación</h2>
                <p className="text-xs text-muted-foreground">
                  {formatCUP(dailyFee)} por cada 24 horas. Se descuenta de tu wallet al enviar la
                  cuenta a revisión.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {DAY_OPTIONS.map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant={days === option ? "gradient" : "outline"}
                  onClick={() => setDays(option)}
                  aria-pressed={days === option}
                >
                  {option} d
                </Button>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">
                {days} día(s) · {days * 24} horas
              </span>
              <span className="font-display text-lg font-bold text-primary">{formatCUP(total)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Saldo actual: {formatCUP(balance)}.{" "}
              {canPay
                ? "Al aprobarse, tu cuenta se publicará por las horas contratadas para que todos los que usan la app la vean."
                : "No te alcanza el saldo: agrega fondos antes de enviarla."}
            </p>
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
              <Input
                id="correo-cuenta"
                type="email"
                autoComplete="off"
                placeholder="cuenta@ejemplo.com"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contrasena-cuenta">Contraseña de la cuenta</Label>
              <div className="relative">
                <Input
                  id="contrasena-cuenta"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="pr-10"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acceso-admin">Descripción extra para acceder</Label>
              <Textarea
                id="acceso-admin"
                rows={3}
                placeholder="Indica método de acceso, códigos o pasos que necesitará el administrador."
                required
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="text-xs text-destructive">
              Aviso importante: después de enviar la cuenta a revisión y de que sea aprobada,
              intentar cambiar los datos de la cuenta (correo, contraseña o acceso) provocará el
              baneo permanente de la aplicación.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={sending}>
            {sending ? "Enviando…" : `Enviar para revisión y pagar ${formatCUP(total)}`}
          </Button>
          <p className="text-xs text-muted-foreground">
            Todas las publicaciones inician en estado pendiente. Si el administrador la rechaza, te
            devolvemos el importe a tu wallet.
          </p>
        </form>
      </div>
    </UserShell>
  );
}
