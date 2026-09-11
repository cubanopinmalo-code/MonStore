import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildListingShareUrl, shareListing } from "@/lib/share";

type Props = {
  listingId: string;
  title: string;
  className?: string;
  variant?: "outline" | "ghost" | "secondary";
  size?: "sm" | "icon" | "default";
  withLabel?: boolean;
};

export function ShareListingButton({
  listingId,
  title,
  className,
  variant = "outline",
  size = "sm",
  withLabel = true,
}: Props) {
  async function handleShare() {
    const result = await shareListing(listingId, title);
    if (result === "copied") {
      toast.success("Enlace copiado", {
        description: "Compártelo con tus amigos para que vean esta cuenta.",
      });
    } else if (result === "failed") {
      toast.error("No pudimos compartir", {
        description: buildListingShareUrl(listingId),
      });
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={() => void handleShare()}
      aria-label={`Compartir ${title}`}
    >
      <Share2 aria-hidden="true" />
      {withLabel ? "Compartir" : null}
    </Button>
  );
}
