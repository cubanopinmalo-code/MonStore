import type { ReactNode } from "react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useClearAccountCache } from "@/hooks/useAccount";
import { signOut } from "@/lib/auth";

type Props = {
  children: ReactNode;
};

export function SignOutDialog({ children }: Props) {
  const navigate = useNavigate();
  const clearCache = useClearAccountCache();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirmSignOut() {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    try {
      // Se cancela y vacía la caché antes de cerrar para que nada quede visible.
      await clearCache();
      await signOut();
      // Se reemplaza el historial: el botón «atrás» no puede volver a la zona privada.
      void navigate({ to: "/login", replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <LogOut className="size-4 text-primary" aria-hidden="true" />
            ¿Cerrar sesión?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Saldrás de tu cuenta en MONSTORE. Tus fondos, pedidos y referidos quedan guardados y
            podrás volver a entrar cuando quieras.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Seguir aquí</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={(event) => {
              event.preventDefault();
              void confirmSignOut();
            }}
          >
            {busy ? "Cerrando…" : "Sí, cerrar sesión"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
