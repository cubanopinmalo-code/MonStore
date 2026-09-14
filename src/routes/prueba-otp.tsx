/**
 * FASE 2.6 — Pantalla de prueba controlada (no forma parte del acceso real).
 * Ruta temporal: /prueba-otp
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { requestOtpTest, verifyOtpTest } from "@/lib/otp-test.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/prueba-otp")({
  head: () => ({
    meta: [
      { title: "MONSTORE — Prueba de acceso por SMS" },
      {
        name: "description",
        content:
          "Pantalla técnica temporal para validar el acceso con teléfono y código SMS en MONSTORE.",
      },
      { property: "og:title", content: "MONSTORE — Prueba de acceso por SMS" },
      {
        property: "og:description",
        content: "Prueba controlada del acceso por teléfono y código de un solo uso.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OtpTestPage,
});

function OtpTestPage() {
  const request = useServerFn(requestOtpTest);
  const verify = useServerFn(verifyOtpTest);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const push = (line: string) => setLog((prev) => [...prev, line]);

  const onRequest = async () => {
    setBusy(true);
    try {
      const result = await request({ data: { phone } });
      push(`solicitar: ${JSON.stringify(result)}`);
    } catch (e) {
      push(`solicitar ERROR: ${String(e)}`);
    }
    setBusy(false);
  };

  const onVerify = async () => {
    setBusy(true);
    try {
    const result = await verify({ data: { phone, code } });
    push(`verificar: ${JSON.stringify({ ...result, tokenHash: "oculto" })}`);
    if (result.ok) {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: result.tokenHash,
        type: "email",
      });
      push(`sesion: ${error ? error.message : `ok user=${data.user?.id}`}`);
    }
    } catch (e) {
      push(`verificar ERROR: ${String(e)}`);
    }
    setBusy(false);
  };

  const onDiagnose = async () => {
    setBusy(true);
    const { data: sessionData } = await supabase.auth.getSession();
    push(`getSession: ${sessionData.session ? "válida" : "ninguna"}`);
    const { data: userData } = await supabase.auth.getUser();
    push(`getUser: ${userData.user?.id ?? "ninguno"} (${userData.user?.email ?? "-"})`);
    const profile = await supabase.from("profiles").select("id, phone").maybeSingle();
    push(`profiles: ${JSON.stringify(profile.data ?? profile.error?.message)}`);
    const wallet = await supabase.from("wallets").select("user_id, balance").maybeSingle();
    push(`wallets: ${JSON.stringify(wallet.data ?? wallet.error?.message)}`);
    const roles = await supabase.from("user_roles").select("role");
    push(`user_roles: ${JSON.stringify(roles.data ?? roles.error?.message)}`);
    setBusy(false);
  };

  const onSignOut = async () => {
    await supabase.auth.signOut();
    push("signOut ejecutado");
  };

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-bold">Prueba técnica de acceso por SMS</h1>
      <div className="space-y-1.5">
        <Label htmlFor="p">Teléfono</Label>
        <Input id="p" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+53 5 000 0000" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c">Código</Label>
        <Input id="c" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onRequest} disabled={busy}>Solicitar código</Button>
        <Button onClick={onVerify} disabled={busy} variant="secondary">Verificar</Button>
        <Button onClick={onDiagnose} disabled={busy} variant="outline">Diagnóstico</Button>
        <Button onClick={onSignOut} disabled={busy} variant="ghost">Salir</Button>
      </div>
      <pre data-testid="otp-log" className="whitespace-pre-wrap rounded-md border p-3 text-xs">
        {log.join("\n")}
      </pre>
    </main>
  );
}
