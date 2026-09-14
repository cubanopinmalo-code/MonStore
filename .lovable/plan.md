# FASE 1 — INFORME FINAL

## 0. DETENCIÓN: acceso que falta

Aplico tu regla del final: me detengo y te digo exactamente qué falta.

**Comprobado ahora mismo, no supuesto:** las herramientas de base de datos y de almacenamiento de esta sesión están vinculadas a un único backend, y es `yfimkckjhhvxkbkyxexd`. No existe ninguna vía desde aquí hacia `nklgztbukgaoycuaryzk`.

Por tanto, de los dos elementos que aprobaste crear:

| Elemento aprobado | Estado |
|---|---|
| Ajuste de WhatsApp de soporte | **NO creado** — falta acceso |
| Depósito privado `avatars` | **NO creado** — falta acceso |
| Depósito privado `catalog` | **NO creado** — falta acceso |
| Depósito privado `deposit-proofs` | **NO creado** — falta acceso |
| Depósito privado `listings` | **NO creado** — falta acceso |

**Permiso que falta, en concreto:** capacidad de ejecutar cambios de esquema y de crear depósitos de archivos en el proyecto `nklgztbukgaoycuaryzk`. Hoy solo el proyecto de referencia (el Admin Panel) lo tiene conectado.

**Dos formas de dármelo, y no improviso ninguna otra:**

- **Opción A.** Abres el proyecto de referencia y me pides allí que aplique la preparación. El SQL exacto ya está escrito abajo (§B1): se copia tal cual, no hay que decidir nada. Es la vía más rápida y no requiere credenciales nuevas.
- **Opción B.** Autorizas conectar `nklgztbukgaoycuaryzk` a este proyecto como backend externo. Eso sí cambiaría la conexión de esta app, que es justo lo que prohibiste en esta fase. **No la recomiendo ahora.**

Recomiendo la **Opción A**. Dime y seguimos.

No improvisé nada, no cambié de backend y no toqué el actual.

---

## A. Estructuras del backend definitivo verificadas

Verificadas contra las migraciones 002–005 del proyecto de referencia, línea por línea. **Todas presentes:**

**Identidad y roles:** perfiles (con teléfono único, código de referido, identificador antiguo, provincia y municipio), roles de usuario, usuarios bloqueados, correspondencia de usuarios antiguos.

**Dinero:** saldos, movimientos de saldo inmutables, líneas de saldo, solicitudes de fondos, solicitudes de retiro, asientos financieros, configuración de métodos de pago, destinos de pago, eventos de línea inmutables.

**Catálogo y pedidos:** juegos (con lista de plataformas), ofertas, vistas públicas de ambos, pedidos, historial de estados de pedido, costo del proveedor en dólares unitario y total.

**Comercio de cuentas:** publicaciones, credenciales cifradas, registro de accesos a credenciales, ventas.

**Eventos:** eventos, salas, participantes, resultados, registro de notificaciones.

**Otros:** notificaciones, campañas, referidos, favoritos, preferencia de moneda, ajustes (con valor numérico y texto libre), auditoría.

**Ajustes comerciales ya cargados:** costo base del dólar 1.000, ganancia por dólar 150, tarifa de publicación diaria 150, valor del saldo móvil 2,8, reutilización de líneas.

**Conflictos con las migraciones 002–005: ninguno.** Nada de lo aprobado duplica una tabla existente.

## B. Estructuras creadas

**Ninguna.** Falta el acceso del §0.

### B1. SQL exacto, listo para aplicar en el backend definitivo

Este es el contenido completo de la preparación aprobada. Es aditivo, no borra nada y se puede ejecutar dos veces sin efecto secundario.

```sql
-- Ajuste de WhatsApp de soporte
INSERT INTO public.settings(key, name, value, unit, description, is_active, text_value)
VALUES ('support_whatsapp','WhatsApp de soporte',0,NULL,
        'Número de WhatsApp de atención al cliente',true,'')
ON CONFLICT (key) DO NOTHING;

-- Reglas de acceso para los cuatro depósitos privados.
-- Los depósitos se crean antes, como privados, desde el panel de almacenamiento.

-- avatars: cada quien gestiona su propia carpeta; el administrador puede leer todo.
CREATE POLICY "avatars_own_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'avatars' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'avatars' AND owner = auth.uid());
CREATE POLICY "avatars_admin_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND public.is_admin());

-- catalog: lectura para cualquier sesión iniciada, escritura solo administrador.
CREATE POLICY "catalog_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'catalog');
CREATE POLICY "catalog_admin_write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'catalog' AND public.is_admin())
  WITH CHECK (bucket_id = 'catalog' AND public.is_admin());

-- deposit-proofs: el cliente sube y ve lo suyo; el administrador lee todo. Nadie borra.
CREATE POLICY "proofs_own_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'deposit-proofs' AND owner = auth.uid());
CREATE POLICY "proofs_own_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'deposit-proofs' AND owner = auth.uid());
CREATE POLICY "proofs_admin_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'deposit-proofs' AND public.is_admin());

-- listings: el vendedor gestiona sus fotos; el administrador lee todo.
CREATE POLICY "listings_own_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'listings' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'listings' AND owner = auth.uid());
CREATE POLICY "listings_admin_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'listings' AND public.is_admin());
```

Ninguna regla da acceso a visitantes sin sesión: los cuatro depósitos quedan cerrados al público y todo acceso pasa por enlaces temporales generados en el servidor.

## C. Estado de los cuatro depósitos privados

| Depósito | Privado | Creado | Reglas |
|---|---|---|---|
| avatars | Sí, previsto | **No** | Escritas, sin aplicar (§B1) |
| catalog | Sí, previsto | **No** | Escritas, sin aplicar |
| deposit-proofs | Sí, previsto | **No** | Escritas, sin aplicar |
| listings | Sí, previsto | **No** | Escritas, sin aplicar |

El backend definitivo **no tiene hoy ningún depósito de archivos**. Al crearlos hay que marcarlos privados de forma explícita: es el punto donde un descuido dejaría comprobantes de pago y credenciales al alcance de cualquiera.

## D. Reglas de acceso y funciones sensibles

**En el backend definitivo — verificado, y es más estricto que el actual:**

| Comprobación | Resultado |
|---|---|
| Reglas de acceso activas en todas las tablas | Sí |
| El cliente no ve el costo del proveedor | Sí — fuera de las vistas públicas |
| El cliente no puede modificar su saldo | Sí — solo lectura; el saldo cambia únicamente por función controlada |
| Retiros: aprobar y rechazar | Función con rol verificado en el servidor |
| Publicaciones: aprobar y rechazar | Función con rol verificado |
| Eventos: crear, abrir sala, resultados | Función con rol verificado |
| Operaciones de saldo y ajustes manuales | Función con rol verificado y asiento contable |
| Fondos: aprobar y rechazar | Función con rol verificado |
| Credenciales de cuentas | Sin ningún permiso para el cliente; cada lectura queda registrada |
| Pedidos y reembolsos | Reembolso solo administrativo, con asiento |
| Ruta de búsqueda fijada en funciones sensibles | Sí |
| Registros inmutables (movimientos, auditoría, historial, eventos de línea) | Sí, por disparador |
| Funciones internas revocadas al cliente | Sí |

**Riesgo pendiente, y está en esta app, no en el backend definitivo:** aprobar retiros, aprobar publicaciones y abrir sala de evento se invocan hoy **desde el navegador**. El backend definitivo ya rechaza al que no sea administrador, así que no hay agujero real, pero al adaptar hay que moverlas a funciones de servidor con doble comprobación. Queda anotado como trabajo de la fase de adaptación.

**No modifiqué ninguna regla de acceso, en ningún backend.**

## E. Pedidos y dinero

El modelo canónico está **completo y verificado**: crear → pagar → procesar → entregar/fallar → reembolsar.

| Protección | Estado |
|---|---|
| Idempotencia | Cubierta: clave de operación; si se repite devuelve el pedido existente |
| Doble cobro | Cubierta: pagar solo avanza desde pendiente de pago |
| Doble pedido | Cubierta por la misma clave, además comprobando que sea del mismo usuario |
| Doble entrega | Cubierta: una sola función de cambio de estado |
| Transiciones inválidas | Cubiertas por disparador que aborta saltos no permitidos |
| Historial de estados | Sí, inmutable |
| Saldo no negativo | Cubierto por restricción de la propia tabla, no solo por código |
| Precio calculado en el servidor | Sí; el navegador no envía precio |
| Bloqueo de ofertas vía cuenta | Sí, la creación de pedido aborta explícitamente |
| Registro financiero | Sí, asiento por operación |
| Trazabilidad y auditoría | Sí |

Cada pedido congela nombre de juego, nombre de oferta, precio unitario, total, costo unitario, costo total, costo del proveedor en dólares y la configuración comercial vigente. **No requiere ningún trabajo adicional.**

## F. Modelo de catálogo

Verificado que el esquema definitivo admite la clasificación aprobada **sin ningún cambio de estructura**: los tres tipos existen y 5.070 vía identificador + 1.123 por código + 0 vía cuenta encajan tal cual.

Protección de precios: **ya implementada en el destino.** Un disparador aborta cualquier intento de la sincronización de tocar precio de venta, precio promocional, fechas de promoción, activo, destacado u orden comercial. La sincronización solo puede escribir costo, disponibilidad, identificadores técnicos y fecha de última sincronización. Es exactamente lo que pediste y no hay que añadir nada.

Detalles para la futura migración, anotados y no ejecutados: identificador único por oferta derivado del proveedor, región obligatoria (valor general cuando falte), costo en dólares en el bloque técnico y en CUP en su columna, precios copiados exactamente.

**No se migró ningún juego ni ninguna oferta.**

## G. Migración de usuarios

**Formato canónico registrado y bloqueado:** `<telefono>@telefono.monstore.cu`, sin prefijo 53 automático, idéntico al que usa hoy la Customer App. El otro formato queda descartado. Esto resuelve el conflicto crítico que bloqueaba el análisis.

Dado que el destino deriva hoy el correo de otra forma, al adaptar habrá que alinear su función de alta de usuario con este formato — es un ajuste de una línea, anotado para la fase correspondiente.

Sobre las contraseñas: no se guardan en claro en ninguna parte, solo un resumen irreversible. Ese resumen **es transportable** conservando el identificador del usuario, pero copiarlo exige acceso administrativo al sistema de autenticación de ambos proyectos, que aquí no existe. Con un solo usuario real hoy, la vía razonable es crear la cuenta con el mismo identificador y una contraseña temporal que introduzcas tú. **Queda como fase independiente, tal y como indicaste.**

Aviso aparte: hoy **no existe recuperación de acceso** en ninguno de los dos proyectos. Hay que construirla antes de tener volumen de usuarios.

**No se creó, migró ni modificó ninguna cuenta, perfil, saldo ni rol.**

## H. Inventario y clasificación de funciones antiguas

22 funciones del backend actual. **Ninguna eliminada, ninguna tocada.**

| Función | Clasificación |
|---|---|
| `has_role` | **CONSERVAR** — idéntica en ambos |
| `update_updated_at_column` | **CONSERVAR** — idéntica |
| `release_payment_line` | **ADAPTAR** — pasa a evento de línea |
| `claim_referral_reward` | **ADAPTAR** — reescribir sobre la función de saldo canónica |
| `set_display_currency` | **ADAPTAR** — la tabla ya existe, falta la función |
| `top_recharged_games` | **ADAPTAR** — consulta sobre las nuevas tablas |
| `event_participant_counts` | **ADAPTAR** — igual |
| `handle_new_user` | **ADAPTAR** — alinear con el formato de identidad aprobado |
| `place_wallet_order` | **REEMPLAZAR** — por crear pedido + pagar pedido |
| `refund_wallet_order` | **REEMPLAZAR** — por el reembolso administrativo con asiento |
| `request_deposit` | **REEMPLAZAR** — versión antigua, ya en desuso |
| `request_deposit_v2` | **REEMPLAZAR** — por la solicitud de fondos canónica |
| `review_deposit` | **REEMPLAZAR** — por aprobar y rechazar, separadas |
| `request_withdrawal` | **REEMPLAZAR** — por crear solicitud de retiro |
| `review_withdrawal` | **REEMPLAZAR** — por completar y rechazar |
| `publish_game_account` | **REEMPLAZAR** — por publicaciones del destino |
| `review_game_account` | **REEMPLAZAR** — igual |
| `read_account_credentials` | **REEMPLAZAR** — el destino usa otro cifrado y registra accesos |
| `subscribe_event` | **REEMPLAZAR** — el destino separa sala, participantes y resultados |
| `enter_event_room` | **REEMPLAZAR** — igual |
| `encrypt_account_credentials` | **ELIMINAR POSTERIORMENTE** — el destino cifra de otro modo |
| `keep_profile_phone` | **ELIMINAR POSTERIORMENTE** — el destino lo resuelve con teléfono único |

La revocación de `place_wallet_order` y `refund_wallet_order` en el backend antiguo debe hacerse **el día del cambio de conexión**, ni antes ni después: es la única protección real contra un doble cobro mientras los dos backends conviven.

## I. Arquitectura del proveedor

Arquitectura confirmada y correcta: **app → función de servidor → proveedor**. La clave vive en un único archivo del servidor y viaja en una cabecera; no llega al navegador, no está en variables públicas, no está en ninguna tabla y no aparece en ninguna respuesta.

**No se conectó el proveedor, no se introdujo ninguna clave, no se hizo ninguna llamada real, no se realizó ninguna compra.**

## J. Confirmaciones explícitas

- La Customer App **sigue conectada a `yfimkckjhhvxkbkyxexd`**. Verificado directamente contra la configuración viva, no supuesto.
- El backend definitivo **sigue siendo `nklgztbukgaoycuaryzk`**, sin cambios.
- **No se migró ningún dato**: ni usuarios, ni juegos, ni ofertas, ni saldos, ni pedidos, ni archivos.
- **No se modificó ningún dato del backend actual.** Cero escrituras de cualquier tipo.
- **No se introdujo ninguna clave del proveedor** ni ningún secreto.
- **No se eliminó ninguna función**, en ningún backend.
- **No se realizó ningún cambio irreversible.** Lo único modificado en todo el turno son dos documentos de texto de este repositorio: este informe y la lista de tareas.
- **No avanzo a la Fase 2.**

**Esperando tu decisión del §0: Opción A (aplicar la preparación desde el proyecto de referencia) u Opción B.**
