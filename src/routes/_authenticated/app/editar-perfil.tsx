import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfile } from "@/hooks/useAccount";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/editar-perfil")({
  head: () => ({
    meta: [
      { title: "Editar perfil — MONSTORE" },
      { name: "description", content: "Actualiza tu nombre, provincia y municipio en MONSTORE." },
      { property: "og:title", content: "Editar perfil — MONSTORE" },
      {
        property: "og:description",
        content: "Actualiza tu nombre, provincia y municipio en MONSTORE.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditProfilePage,
});

function EditProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useProfile();
  const [saving, setSaving] = useState(false);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        name: String(form.get("name") ?? ""),
        province: String(form.get("province") ?? ""),
        municipality: String(form.get("municipality") ?? ""),
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      toast.error("No pudimos guardar los cambios.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Cambios guardados");
    void navigate({ to: "/app/perfil" });
  }

  return (
    <UserShell>
      <div className="mx-auto max-w-xl space-y-5">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/app/perfil">
            <ChevronLeft className="size-4" aria-hidden="true" />
            Volver al perfil
          </Link>
        </Button>

        <PageHeader title="Editar perfil" description="Actualiza tus datos personales." />

        {isLoading ? null : (
          <form className="surface-card space-y-4 p-5" onSubmit={(e) => void handleSave(e)}>
            <div className="space-y-1.5">
              <Label htmlFor="nombre">Nombre</Label>
              <Input id="nombre" name="name" defaultValue={profile?.name ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input id="telefono" value={profile?.phone ?? ""} readOnly disabled />
              <p className="text-xs text-muted-foreground">
                El teléfono de registro no se puede cambiar.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="provincia">Provincia</Label>
                <Input id="provincia" name="province" defaultValue={profile?.province ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="municipio">Municipio</Label>
                <Input
                  id="municipio"
                  name="municipality"
                  defaultValue={profile?.municipality ?? ""}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </form>
        )}
      </div>
    </UserShell>
  );
}
