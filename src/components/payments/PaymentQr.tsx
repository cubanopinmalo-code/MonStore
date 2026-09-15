import { useEffect, useRef } from "react";
import QRCode from "qrcode";

/** Trazo del rayo del logo MONSTORE (mismo icono que usa src/components/brand/Logo.tsx). */
const LOGO_PATH =
  "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z";
const BRAND = "#0fe3a0";
const SIZE = 320;

export interface PaymentQrData {
  reference: string;
  method: string;
  destinationLabel: string;
  destinationValue: string;
  confirmPhone: string;
  amount: number;
  issuedAt: string;
}

/** Texto codificado en el QR: identifica de forma inequívoca la solicitud de pago. */
export function buildQrPayload(data: PaymentQrData): string {
  return [
    "MONSTORE-PAGO-v1",
    `ref:${data.reference}`,
    `metodo:${data.method}`,
    `destino:${data.destinationLabel}`,
    `cuenta:${data.destinationValue}`,
    `movil:${data.confirmPhone}`,
    `importe:${data.amount.toFixed(2)} CUP`,
    `emitido:${data.issuedAt}`,
  ].join("\n");
}

export function PaymentQr({ data }: { data: PaymentQrData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const payload = buildQrPayload(data);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    void QRCode.toCanvas(canvas, payload, {
      width: SIZE,
      margin: 2,
      // Corrección alta: el logo central tapa pocos módulos y el QR sigue siendo legible.
      errorCorrectionLevel: "H",
      color: { dark: "#0b1220", light: "#ffffff" },
    })
      .then(() => {
        if (cancelled) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const box = Math.round(canvas.width * 0.2);
        const x = Math.round((canvas.width - box) / 2);
        const y = Math.round((canvas.height - box) / 2);
        const radius = Math.round(box * 0.24);

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, box, box, radius);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = Math.max(2, Math.round(box * 0.05));
        ctx.strokeStyle = BRAND;
        ctx.stroke();

        const icon = box * 0.6;
        ctx.translate(x + (box - icon) / 2, y + (box - icon) / 2);
        ctx.scale(icon / 24, icon / 24);
        ctx.fillStyle = BRAND;
        ctx.fill(new Path2D(LOGO_PATH));
        ctx.restore();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [payload]);

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-card p-4">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="h-auto w-full max-w-[280px] rounded-lg"
        role="img"
        aria-label={`Código QR con los datos del pago por ${data.amount} CUP`}
      />
      <p className="text-center text-[11px] text-muted-foreground">
        Escanéalo desde otro dispositivo para ver los datos exactos de este pago. El QR no acredita
        fondos: tu solicitud sigue el proceso normal de verificación.
      </p>
      <p className="font-mono text-[11px] text-muted-foreground">Ref: {data.reference}</p>
    </div>
  );
}
