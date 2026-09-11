/** Enlace público para compartir una cuenta publicada en el comercio. */
export function buildListingShareUrl(listingId: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://monstore.cu";
  return `${origin}/app/comercio/${listingId}`;
}

type ShareResult = "shared" | "copied" | "failed";

/** Comparte con el menú nativo y, si no existe, copia el enlace. */
export async function shareListing(
  listingId: string,
  title: string,
): Promise<ShareResult> {
  const url = buildListingShareUrl(listingId);
  const text = `Mira esta cuenta en venta en MONSTORE: ${title}`;

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return "shared";
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
