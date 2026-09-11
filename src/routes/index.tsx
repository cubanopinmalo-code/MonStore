import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Gamepad2,
  ShieldCheck,
  Store,
  Timer,
  Wallet,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { mockGames } from "@/data/mock/games";
import { formatCUP } from "@/lib/format";
import { mockProducts } from "@/data/mock/products";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MONSTORE — Recargas de videojuegos con wallet en CUP" },
      {
        name: "description",
        content:
          "Recarga Free Fire, Mobile Legends, Delta Force y más desde Cuba. Wallet en CUP, pedidos automáticos y comercio de cuentas.",
      },
      { property: "og:title", content: "MONSTORE — Recargas de videojuegos" },
      {
        property: "og:description",
        content:
          "Recargas rápidas para tus juegos favoritos con wallet en CUP y soporte cubano.",
      },
    ],
  }),
  component: HomePage,
});

const STEPS = [
  { icon: Wallet, title: "Agrega saldo", text: "Recarga tu wallet con saldo móvil o tarjeta CUP." },
  { icon: Gamepad2, title: "Elige tu recarga", text: "Selecciona el juego y la oferta que necesitas." },
  { icon: Zap, title: "Recibe al instante", text: "Procesamos el pedido y te avisamos al terminar." },
];

const BENEFITS = [
  { icon: ShieldCheck, title: "Pagos protegidos", text: "Tu saldo y tus datos se gestionan desde el servidor, nunca desde el navegador." },
  { icon: Timer, title: "Entrega rápida", text: "Pedidos automáticos con seguimiento de estado en tiempo real." },
  { icon: Store, title: "Comercio gamer", text: "Compra y vende cuentas verificadas por nuestro equipo." },
];

function HomePage() {
  const featured = mockGames.filter((game) => game.active).slice(0, 4);
  const categories = [...new Set(mockGames.map((game) => game.category))];
  const cheapest = Math.min(...mockProducts.map((product) => product.sale_price));

  return (
    <AppShell>
      <section className="relative overflow-hidden border-b border-border/70">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: "var(--gradient-surface)" }}
          aria-hidden="true"
        />
        <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 md:py-20 lg:grid-cols-2 lg:items-center">
          <div className="space-y-6">
            <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
              Recargas para Cuba · Precios en CUP
            </Badge>
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">
              Recarga tus juegos favoritos con{" "}
              <span className="text-gradient-primary">MONSTORE</span>
            </h1>
            <p className="max-w-xl text-base text-muted-foreground">
              Diamantes, monedas y pases para Free Fire, Mobile Legends, Delta Force y más.
              Paga con tu wallet en CUP y sigue cada pedido desde tu teléfono.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/recargas">
                  Ver recargas
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/registro">Crear cuenta gratis</Link>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Recargas desde <span className="font-semibold text-foreground">{formatCUP(cheapest)}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {featured.map((game) => (
              <Link
                key={game.id}
                to="/juegos/$slug"
                params={{ slug: game.slug }}
                className="group surface-card overflow-hidden transition-transform duration-200 hover:-translate-y-1"
              >
                <img
                  src={game.image_url}
                  alt={`Portada de ${game.name}`}
                  loading="lazy"
                  width={768}
                  height={1024}
                  className="aspect-4/3 w-full object-cover"
                />
                <div className="space-y-0.5 p-3">
                  <p className="text-sm font-semibold">{game.name}</p>
                  <p className="text-xs text-muted-foreground">{game.offers_count} ofertas</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12">
        <h2 className="text-xl font-bold">Categorías</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.map((category) => (
            <Link
              key={category}
              to="/recargas"
              className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {category}
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-6">
        <h2 className="text-xl font-bold">Cómo funciona</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title} className="surface-card p-5">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <step.icon className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Paso {index + 1}
              </p>
              <h3 className="mt-1 text-base font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12">
        <h2 className="text-xl font-bold">Por qué MONSTORE</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {BENEFITS.map((benefit) => (
            <div key={benefit.title} className="surface-card p-5">
              <benefit.icon className="size-5 text-accent" aria-hidden="true" />
              <h3 className="mt-3 text-base font-semibold">{benefit.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{benefit.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-16">
        <div className="surface-card flex flex-col items-center gap-4 p-8 text-center glow-ring">
          <h2 className="text-2xl font-bold">Empieza hoy con tu wallet MONSTORE</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Crea tu cuenta, agrega saldo y recarga en segundos. También puedes publicar tu
            cuenta de juego en el comercio.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link to="/registro">Crear cuenta</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/comercio">Explorar comercio</Link>
            </Button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
