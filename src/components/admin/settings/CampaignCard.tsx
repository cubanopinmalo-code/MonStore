import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  countCampaignAudience,
  listCampaignEvents,
  sendCampaign,
} from "@/lib/settings.functions";

/**
 * Notificaciones masivas: a todos los clientes activos o a los inscritos de un
 * evento. La clave de envío evita duplicados si se pulsa dos veces.
 */
export function CampaignCard() {
  const loadEvents = useServerFn(listCampaignEvents);
  const countAudience = useServerFn(countCampaignAudience);
  const send = useServerFn(sendCampaign);

  const [audience, setAudience] = useState<"todos" | "evento">("todos");
  const [eventId, setEventId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());

  const { data: events } = useQuery({
    queryKey: ["campaign-events"],
    queryFn: () => loadEvents(),
    staleTime: 60 * 1000,
  });

  const { data: count } = useQuery({
    queryKey: ["campaign-audience", audience, eventId],
    queryFn: () => countAudience({ data: { audience, eventId: eventId || null } }),
    enabled: audience === "todos" || Boolean(eventId),
  });

  useEffect(() => {
    setConfirming(false);
  }, [audience, eventId, title, message]);

  const recipients = useMemo(() => Number(count?.count ?? 0), [count]);

  const mutation = useMutation({
    mutationFn: () =>
      send({ data: { title, message, audience, eventId: eventId || null, idempotency: key } }),
    onSuccess: (result) => {
      setConfirming(false);
      setKey(crypto.randomUUID());
      if (result.duplicated) {
        toast.info("Ese envío ya se había realizado.");
        return;
      }
      setTitle("");
      setMessage("");
      toast.success(`Notificación enviada a ${result.recipients} cliente(s).`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="surface-card space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold">Notificaciones masivas</h2>
        <p className="text-xs text-muted-foreground">
          Aparecen en el buzón de notificaciones de la aplicación del cliente.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Público</Label>
          <Select value={audience} onValueChange={(value) => setAudience(value as "todos" | "evento")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los clientes activos</SelectItem>
              <SelectItem value="evento">Inscritos en un evento</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {audience === "evento" ? (
          <div className="space-y-1.5">
            <Label>Evento</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger>
                <SelectValue placeholder="Elige el evento" />
              </SelectTrigger>
              <SelectContent>
                {(events ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="camp-titulo">Título</Label>
        <Input
          id="camp-titulo"
          value={title}
          onChange={(event) => setTitle(event.target.value.slice(0, 120))}
          placeholder="Nuevo evento este viernes"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="camp-mensaje">Descripción</Label>
        <Textarea
          id="camp-mensaje"
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value.slice(0, 600))}
          placeholder="Escribe el mensaje que verán los clientes"
        />
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Vista previa</p>
        <p className="font-semibold">{title || "Título del aviso"}</p>
        <p className="text-muted-foreground">{message || "Descripción del aviso"}</p>
        <p className="text-xs text-muted-foreground">Destinatarios estimados: {recipients}</p>
      </div>

      {confirming ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Enviando…" : `Sí, enviar a ${recipients} cliente(s)`}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button
          disabled={title.trim().length < 3 || message.trim().length < 3 || recipients === 0}
          onClick={() => setConfirming(true)}
        >
          Revisar y enviar
        </Button>
      )}
    </section>
  );
}
