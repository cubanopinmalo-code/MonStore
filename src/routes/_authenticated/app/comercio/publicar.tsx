import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ChevronLeft,
  Clock,
  Eye,
  EyeOff,
  ImagePlus,
  LockKeyhole,
  Trash2,
} from "lucide-react";
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
import { DEFAULT_LISTING_FEE_PER_DAY, feeForDays, useListingFee } from "@/hooks/useMarketplace";
import { usePlatformFlags } from "@/hooks/usePlatformFlags";
import { formatCUP } from "@/lib/format";
import { listPublishableGames, publishListing } from "@/lib/marketplace-config.functions";

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

interface PickedImage {
  id: string;
  file: File;
  url: string;
}

function PublishListingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: wallet } = useWallet();
  const { data: feePerDay } = useListingFee();
  const { data: flags } = usePlatformFlags();

  // Los juegos, regiones, plataformas y campos los decide el administrador.
  const loadGames = useServerFn(listPublishableGames);
  const publish = useServerFn(publishListing);
  const { data: configs, isLoading: loadingGames } = useQuery({
    queryKey: ["marketplace-publishable-games"],
    queryFn: () => loadGames(),
  });

  const [configId, setConfigId] = useState("");
  const [price, setPrice] = useState("");
  const [region, setRegion] = useState("");
  const [platform, setPlatform] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [images, setImages] = useState<PickedImage[]>([]);
  const [imageError, setImageError] = useState(false);
  const [days, setDays] = useState(1);
  const [sending, setSending] = useState(false);

  const config = useMemo(
    () => (configs ?? []).find((item) => item.id === configId),
    [configs, configId],
  );

  // Al cambiar de juego solo se limpian los datos que dependen de él.
  useEffect(() => {
    setRegion("");
    setPlatform("");
    setValues({});
  }, [configId]);

  useEffect(() => () => images.forEach((image) => URL.revokeObjectURL(image.url)), [images]);

  const dailyFee = feePerDay?.perDay ?? DEFAULT_LISTING_FEE_PER_DAY;
  const total = feeForDays(feePerDay, days);
  const balance = Number(wallet?.balance ?? 0);
  const canPay = balance >= total;

  function addImages(list: File[]) {
    if (list.length === 0) return;
    setImages((previous) => [
      ...previous,
      ...list.map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
    setImageError(false);
  }

  function removeImage(id: string) {
    setImages((previous) => {
      const target = previous.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return previous.filter((image) => image.id !== id);
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !config) {
      toast.error("Selecciona el juego que quieres publicar");
      return;
    }
    if (!region || !platform) {
      toast.error("Completa la región y la plataforma de acceso");
      return;
    }
    const missing = config.fields.find(
      (field) => field.required && !String(values[field.key] ?? "").trim(),
    );
    if (missing) {
      toast.error(`Completa el campo "${missing.label}"`);
      return;
    }
    if (images.length < 1) {
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
    for (const image of images) {
      const ext = image.file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("listings")
        .upload(path, image.file, { contentType: image.file.type });
      if (error) {
        setSending(false);
        toast.error("No pudimos subir las fotos", { description: error.message });
        return;
      }
      paths.push(path);
    }

    try {
      const result = await publish({
        data: {
          configId: config.id,
          price: Number(price),
          region,
          platform,
          images: paths,
          days,
          values,
        },
      });
      const charged = Number(result?.total ?? total);
      await queryClient.invalidateQueries();
      toast.success(`Cuenta enviada a revisión — se descontaron ${formatCUP(charged)}`, {
        description: `Al ser aprobada, tu cuenta será publicada por ${days * 24} horas para que todos los que usan la app la vean. ¡Buena suerte con la venta!`,
      });
      void navigate({ to: "/app/comercio/mis-publicaciones" });
    } catch (error) {
      toast.error("No pudimos enviar la publicación", {
        description: error instanceof Error ? error.message : "Inténtalo de nuevo.",
      });
    } finally {
      setSending(false);
    }
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
            <Select value={configId} onValueChange={setConfigId}>
              <SelectTrigger id="juego">
                <SelectValue
                  placeholder={loadingGames ? "Cargando juegos…" : "Selecciona el juego"}
                />
              </SelectTrigger>
              <SelectContent>
                {(configs ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingGames && (configs ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Ahora mismo no hay juegos habilitados para publicar. Vuelve más tarde.
              </p>
            ) : null}
          </div>

          {config ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="region">
                  Región de la cuenta <span className="text-destructive">*</span>
                </Label>
                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger id="region">
                    <SelectValue placeholder="Selecciona la región" />
                  </SelectTrigger>
                  <SelectContent>
                    {config.regions.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
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
                    {config.platforms.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Opciones permitidas para {config.name}.
                </p>
              </div>
            </>
          ) : null}

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
            <Label htmlFor="imagenes">
              Fotos de la cuenta <span className="text-destructive">*</span>
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
              {images.length > 0 ? "Agregar más fotos" : "Selecciona la foto principal y las demás"}
            </label>
            <Input
              id="imagenes"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                addImages(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            {images.length > 0 ? (
              <ul className="grid grid-cols-3 gap-2">
                {images.map((image, index) => (
                  <li key={image.id} className="relative overflow-hidden rounded-md border border-border">
                    <img
                      src={image.url}
                      alt={`Foto ${index + 1} de la cuenta`}
                      className="aspect-square w-full object-cover"
                    />
                    {index === 0 ? (
                      <span className="absolute left-1 top-1 rounded bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                        Principal
                      </span>
                    ) : null}
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute right-1 top-1 size-7"
                      aria-label={`Eliminar la foto ${index + 1}`}
                      onClick={() => removeImage(image.id)}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            {imageError ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                Debes enviar al menos 1 foto antes de mandar la cuenta a revisión.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              La primera imagen será la foto principal pública. Puedes eliminar o agregar fotos
              antes de enviar.
            </p>
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

          {config && config.fields.length > 0 ? (
            <div className="space-y-4 rounded-md border border-border bg-muted/30 p-4">
              <div className="flex items-start gap-2">
                <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h2 className="text-sm font-semibold">Datos de la cuenta</h2>
                  <p className="text-xs text-muted-foreground">
                    Solo serán visibles para el panel administrador.
                  </p>
                </div>
              </div>
              {config.fields.map((field) => {
                const id = `campo-${field.key}`;
                const value = values[field.key] ?? "";
                const onChange = (next: string) =>
                  setValues((previous) => ({ ...previous, [field.key]: next }));
                return (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={id}>
                      {field.label}
                      {field.required ? <span className="text-destructive"> *</span> : null}
                    </Label>
                    {field.type === "nota" ? (
                      <Textarea
                        id={id}
                        rows={3}
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                      />
                    ) : field.type === "contrasena" ? (
                      <div className="relative">
                        <Input
                          id={id}
                          type={visible[field.key] ? "text" : "password"}
                          autoComplete="new-password"
                          className="pr-10"
                          value={value}
                          onChange={(event) => onChange(event.target.value)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0"
                          aria-label={visible[field.key] ? "Ocultar" : "Mostrar"}
                          onClick={() =>
                            setVisible((previous) => ({
                              ...previous,
                              [field.key]: !previous[field.key],
                            }))
                          }
                        >
                          {visible[field.key] ? (
                            <EyeOff aria-hidden="true" />
                          ) : (
                            <Eye aria-hidden="true" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      <Input
                        id={id}
                        type={field.type === "correo" ? "email" : "text"}
                        inputMode={field.type === "numero" ? "numeric" : undefined}
                        autoComplete="off"
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {config ? (
            <section className="space-y-1 rounded-md border border-border p-4 text-xs">
              <h2 className="text-sm font-semibold">Revisa antes de enviar</h2>
              <p className="text-muted-foreground">Juego: {config.name}</p>
              <p className="text-muted-foreground">Región: {region || "—"}</p>
              <p className="text-muted-foreground">Plataforma de acceso: {platform || "—"}</p>
              <p className="text-muted-foreground">
                Precio: {price ? formatCUP(Number(price)) : "—"}
              </p>
              <p className="text-muted-foreground">
                Fotos: {images.length} · Duración: {days} día(s) · Costo: {formatCUP(total)}
              </p>
            </section>
          ) : null}

          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="text-xs text-destructive">
              Aviso importante: después de enviar la cuenta a revisión y de que sea aprobada,
              intentar cambiar los datos de la cuenta provocará el baneo permanente de la
              aplicación.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={sending || !config}>
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
