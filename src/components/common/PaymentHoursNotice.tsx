import { Clock } from "lucide-react";
import {
  VERIFICATION_WINDOW_LABEL,
  getVerificationClock,
  verificationNotice,
} from "@/lib/paymentHours";

/**
 * Aviso del horario de verificación de pagos. Se muestra antes de enviar una
 * solicitud y también en el wallet, para que el cliente sepa cuándo la revisamos.
 */
export function PaymentHoursNotice({ compact = false }: { compact?: boolean }) {
  const clock = getVerificationClock();

  return (
    <div
      className={`surface-card flex items-start gap-3 ${compact ? "p-3" : "p-4"}`}
      role="note"
    >
      <span
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
          clock.open ? "bg-success/12 text-success" : "bg-warning/12 text-warning"
        }`}
      >
        <Clock className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold">Horario de verificación de pagos</p>
        <p className="text-sm text-muted-foreground">
          Revisamos y aprobamos los pagos de <span className="font-medium">{VERIFICATION_WINDOW_LABEL}</span>{" "}
          (hora de Cuba). Si envías tu solicitud fuera de ese horario, se revisa {clock.nextReview}.
        </p>
        <p
          className={`text-xs font-medium ${clock.open ? "text-success" : "text-warning"}`}
        >
          {clock.open ? "Ahora estamos verificando pagos." : `Fuera de horario: se revisa ${clock.nextReview}.`}
        </p>
      </div>
    </div>
  );
}

export { verificationNotice };
