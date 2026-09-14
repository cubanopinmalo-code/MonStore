# FASE 2.5 — CUTOVER, ROLLBACK Y PRUEBAS

Complemento de `FASE_2_5_AUTH_OTP_MONSTORE.md`. Documento de diseño. **No se ejecutó ningún cambio.**

---

## 1. PLAN DE CUTOVER

Regla general: cada fase termina con una validación de conteos y sumas. Si una validación falla, **no se pasa a la siguiente**.

| Fase | Contenido | Depende de |
|---|---|---|
| **A — Copia de seguridad** | Copia completa del backend antiguo y del definitivo, verificada restaurando en un entorno aparte. Congelar el antiguo en solo lectura para escrituras de negocio. | — |
| **B — Validación del destino** | Estructuras, reglas de acceso, depósitos privados, ajustes comerciales, y **verificación real del mecanismo de sesión con una cuenta de prueba**. | A |
| **C — Identidades** | Crear las cuentas conservando su identificador y el correo interno `<telefono>@telefono.monstore.cu`. Sin contraseñas. Registrar la correspondencia antiguo → nuevo. | B |
| **D — Perfiles, roles y billeteras** | Perfil, rol, saldo disponible y retenido, historial financiero con sus saldos intactos. Validar suma total y número de movimientos **exactamente**. | C |
| **E — Catálogo** | 386 juegos y 6.193 ofertas con precios copiados tal cual y clasificación 5.070 / 1.123 / 0. Sin fusionar duplicados. | B |
| **F — Imágenes** | Copiar a los depósitos privados y reescribir referencias a enlaces temporales. | C, E |
| **G — Resto de datos** | Depósitos, retiros, pedidos e historial, referidos, favoritos, preferencias, eventos, cuentas de juego y sus credenciales, notificaciones, auditoría. En orden de dependencias. | D, E, F |
| **H — Cambio de conexión** | Apuntar la aplicación al destino **y revocar en el mismo paso** `place_wallet_order` y `refund_wallet_order` en el antiguo. Breve ventana de mantenimiento. | G |
| **I — Activación del acceso por código** | Secreto del proveedor, funciones de solicitud/verificación/reenvío, pantalla única de teléfono + código. | H, crédito de SMS |
| **J — Pruebas** | §3 completa, en producción, antes de abrir. | I |
| **K — Apertura** | Abrir al público. Vigilancia reforzada 72 horas: crédito de SMS, fallos de acceso, cuadre de saldos. | J |

Dependencias críticas: C antes que todo lo que referencia usuarios; E puede ir en paralelo a C/D; H solo con G validado; I solo con crédito confirmado y el servidor alcanzando al proveedor.

---

## 2. ROLLBACK

**Punto de no retorno: el final de la fase H.** Antes de H, volver atrás es trivial. Después, cualquier compra o movimiento hecho en el destino tendría que rehacerse a mano en el antiguo.

- **Cómo volver.** Antes de H: no se ha tocado nada de la aplicación, basta con detener el proceso. Durante o inmediatamente después de H: revertir la conexión al antiguo y restaurar los permisos de sus funciones de compra.
- **No perder compras hechas durante el cambio.** La ventana de mantenimiento de H existe precisamente para que no haya compras en curso: la aplicación rechaza compras durante esos minutos. Si aun así hubiera pedidos creados en el destino, se exportan por su identificador y se reproducen en el antiguo antes de reabrir; su número debe ser cero o muy pequeño.
- **No duplicar saldos.** Nunca se vuelve a ejecutar una fase de migración sobre datos ya migrados: cada fila lleva su identificador antiguo, y la reinserción está impedida por unicidad. Si se repite una fase, primero se borra el bloque completo en el destino, nunca se reinserta encima.
- **No duplicar pedidos.** Misma regla: identificador antiguo único por pedido; la clave de idempotencia impide además el doble cargo.
- **Revertir identidades.** Las cuentas del antiguo nunca se tocan ni se borran, así que revertir es simplemente dejar de usar las del destino. Ninguna contraseña se migra y ninguna se destruye.
- **Detectar cambios durante el cutover.** El antiguo queda en solo lectura desde la fase A; cualquier escritura posterior queda registrada en su auditoría y se compara al final contra la copia de seguridad. Diferencia detectada = revisión manual antes de abrir.
- **Conservación:** el backend antiguo se mantiene congelado e intacto **al menos 30 días** tras la apertura.

---

## 3. CHECKLIST OBLIGATORIO DE PREPRODUCCIÓN

### Acceso
- [ ] Entrada con código correcto
- [ ] Código incorrecto
- [ ] Código caducado (pasados 5 minutos)
- [ ] Código ya usado
- [ ] Cinco intentos fallidos invalidan el código
- [ ] Reenvío antes de los 60 segundos rechazado
- [ ] Varias solicitudes: solo el último código funciona
- [ ] Superar los límites por teléfono y por origen provoca bloqueo temporal
- [ ] Teléfono nuevo: se crea cuenta, perfil, billetera y rol
- [ ] Teléfono existente: entra a su cuenta, sin duplicar
- [ ] Teléfono migrado: entra a la cuenta migrada, con su saldo
- [ ] `+5312345678`, `5312345678` y `12345678` llevan a la misma cuenta
- [ ] Sesión válida: perfil, saldo, rol y rutas protegidas
- [ ] Renovación automática de la sesión
- [ ] Cierre de sesión
- [ ] Dos peticiones simultáneas con el mismo código: solo una crea sesión

### Billetera
- [ ] Saldo correcto tras la migración (suma exacta)
- [ ] Retención al comprar
- [ ] Liberación al fallar
- [ ] Reembolso
- [ ] Sin doble descuento
- [ ] Saldo nunca negativo

### Pedidos
- [ ] Creación, pago, procesamiento, completado, fallido, reembolso
- [ ] Idempotencia: mismo intento repetido = un solo cargo
- [ ] Transición inválida rechazada
- [ ] Historial de estados inmutable

### Catálogo
- [ ] Ofertas vía identificador funcionan
- [ ] Ofertas por código funcionan
- [ ] Ofertas vía cuenta bloqueadas
- [ ] Campos obligatorios completos
- [ ] Precios idénticos a los del origen, oferta por oferta

### Seguridad
- [ ] Un usuario no puede ver datos de otro
- [ ] Un cliente no puede acceder a administración
- [ ] La clave de servicio nunca llega al navegador
- [ ] La credencial de G2Bulk nunca llega al navegador
- [ ] El secreto de zdSMS nunca llega al navegador
- [ ] El código nunca se guarda ni se registra en claro
- [ ] Los archivos privados solo se abren con enlace temporal
- [ ] La sincronización del proveedor no puede cambiar precios ni estado comercial
