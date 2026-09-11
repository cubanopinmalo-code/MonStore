import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type GameCoverProps = {
  src?: string | null;
  name: string;
  className?: string;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

/** Portada de juego con respaldo visual cuando la imagen falta o falla. */
export function GameCover({ src, name, className }: GameCoverProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-lg font-semibold text-muted-foreground",
          className,
        )}
        aria-label={`Portada de ${name}`}
        role="img"
      >
        {initials(name) || "?"}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`Portada de ${name}`}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("bg-muted object-cover", className)}
    />
  );
}
