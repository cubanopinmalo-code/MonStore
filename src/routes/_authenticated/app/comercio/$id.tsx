import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Images, MapPin, Monitor, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { UserShell } from "@/components/layout/UserShell";
import { Button } from "@/components/ui/button";
import { mockGameAccounts } from "@/data/mock/marketplace";
import { mockGames } from "@/data/mock/games";
import { mockWallet } from "@/data/mock/wallet";
import { formatCUP } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/comercio/$id")({
  head: () => ({
    meta: [
      { title: "Detalle de cuenta — MONSTORE" },
      { name: "description", content: "Fotos y datos públicos de una cuenta gamer en venta." },
      { property: "og:title", content: "Cuenta gamer en venta — MONSTORE" },
      { property: "og:description", content: "Consulta las fotos y datos de una cuenta revisada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ListingDetailPage,
});

function ListingDetailPage() {
  const { id } = Route.useParams();
  const listing = mockGameAccounts.find((item) => item.id === id && item.status === "aprobada");
  const [selectedImage, setSelectedImage] = useState(0);

  if (!listing) {
    return (
      <UserShell>
        <div className="mx-auto max-w-xl space-y-4 py-12 text-center">
          <h1 className="text-2xl font-bold">Publicación no disponible</h1>
          <p className="text-sm text-muted-foreground">Esta cuenta ya no está publicada o sigue en revisión.</p>
          <Button asChild><Link to="/app/comercio">Volver al comercio</Link></Button>
        </div>
      </UserShell>
    );
  }

  const game = mockGames.find((item) => item.id === listing.game_id);
  const activeImage = listing.images[selectedImage] ?? listing.images[0];
  const canAfford = mockWallet.balance >= listing.price;

  return (
    <UserShell>
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link to="/app/comercio" aria-label="Volver al comercio"><ChevronLeft aria-hidden="true" /></Link>
          </Button>
          <div>
            <p className="text-xs text-muted-foreground">{game?.name}</p>
            <h1 className="text-xl font-bold">{listing.title}</h1>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
          <section className="space-y-3" aria-label="Galería de imágenes">
            <div className="surface-card overflow-hidden">
              <img src={activeImage} alt={`${listing.title}, imagen ${selectedImage + 1}`} width={1200} height={900} className="aspect-4/3 w-full object-cover" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {listing.images.map((image, index) => (
                <Button key={`${image}-${index}`} type="button" variant="outline" className={`h-auto overflow-hidden p-0 ${selectedImage === index ? "ring-2 ring-primary" : ""}`} onClick={() => setSelectedImage(index)} aria-label={`Ver imagen ${index + 1}`}>
                  <img src={image} alt="" width={240} height={180} className="aspect-4/3 w-full object-cover" />
                </Button>
              ))}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="surface-card space-y-4 p-5">
              <div className="flex items-center gap-2 text-sm"><UserRound className="text-primary" aria-hidden="true" /><span><span className="text-muted-foreground">Vendedor:</span> {listing.seller_name}</span></div>
              <div className="flex items-center gap-2 text-sm"><MapPin className="text-primary" aria-hidden="true" /><span><span className="text-muted-foreground">Región:</span> {listing.region}</span></div>
              <div className="flex items-center gap-2 text-sm"><Monitor className="text-primary" aria-hidden="true" /><span><span className="text-muted-foreground">Plataforma:</span> {listing.platform}</span></div>
              <div className="flex items-center gap-2 text-sm"><Images className="text-primary" aria-hidden="true" /><span>{listing.images.length} imágenes del vendedor</span></div>
              <p className="border-t border-border pt-4 text-sm text-muted-foreground">{listing.description}</p>
              <div className="border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">Precio</p>
                <p className="font-display text-3xl font-bold text-primary">{formatCUP(listing.price)}</p>
              </div>
              <Button className="w-full" disabled={!canAfford} onClick={() => toast.success("Compra iniciada (simulación)", { description: "No se descontó saldo ni se realizó una compra real." })}>Comprar</Button>
              {!canAfford ? <p className="text-center text-xs text-destructive">Saldo insuficiente. Agrega fondos para continuar.</p> : null}
            </div>
            <div className="flex gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
              <p>La publicación fue revisada. Los datos de acceso no son públicos.</p>
            </div>
          </aside>
        </div>
      </div>
    </UserShell>
  );
}