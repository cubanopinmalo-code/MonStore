import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 font-display text-lg font-bold tracking-tight"
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary glow-ring">
        <Zap className="size-4" aria-hidden="true" />
      </span>
      <span>
        MON<span className="text-primary">STORE</span>
      </span>
    </Link>
  );
}
