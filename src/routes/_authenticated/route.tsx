import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { RouteLoading } from "@/components/common/RouteLoading";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Sesión local: no hace petición de red, así la app no parpadea al volver.
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) throw redirect({ to: "/" });
    return { user };
  },
  pendingComponent: RouteLoading,
  component: () => <Outlet />,
});
