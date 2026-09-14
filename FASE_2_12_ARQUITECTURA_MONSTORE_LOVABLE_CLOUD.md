# FASE 2.12 — Arquitectura oficial de MonStore: Lovable Cloud como backend principal

Fecha: 14/09/2026. Alcance: **solo lectura y documentación**. No se migró, copió, creó, modificó ni
eliminó ninguna tabla, política, función, permiso, dato, precio, usuario, wallet, archivo, secreto ni
configuración. No se conectó G2Bulk ni zdSMS. No se tocó el proyecto externo ni el antiguo. Ninguna
operación de Git (sin push, sin cambios de rama, sin force push).

---

## 1. Backend actual utilizado

La aplicación opera **exclusivamente contra el backend de Lovable Cloud**, referencia interna
`tvzbcqxgfoqvxzpjqwus`, tanto en el navegador como en el servidor. Es el mismo backend para la vista
previa y para la publicación. No existe ninguna conexión activa a un segundo backend, ni escritura
doble, ni sincronización bidireccional. `supabase/config.toml` y `.env` apuntan a este backend.

## 2. Estado de Lovable Cloud

Activo, sin pausas, instancia pequeña, gestionado por Lovable. Proporciona base de datos,
autenticación, almacenamiento, funciones de servidor y publicación. Es coherente con la nueva
arquitectura: **una sola fuente de verdad**.

## 3. Estado de Auth

Auth de Lovable Cloud disponible, con **0 usuarios registrados** (backend limpio). El acceso del
código sigue siendo únicamente teléfono + código de 6 dígitos: no existe entrada por contraseña, ni
recuperación por correo, ni sesión paralela, ni la página pública de prueba de código (verificado: no
hay ninguna ruta de prueba). El rol administrativo no depende del teléfono, sino de la tabla de roles
y de `has_role`, que sí existe en la base de datos. El envío de SMS continúa **simulado**.

## 4. Estado de Database

29 tablas en producción, todas las que el código usa hoy: perfiles, roles, wallets y movimientos,
depósitos, retiros, líneas de pago y sus eventos, ajustes de plataforma y de pagos, destinos de pago,
juegos, ofertas, pedidos, transacciones del proveedor, eventos e inscripciones, comercio de cuentas y
sus credenciales, notificaciones, referidos, favoritos, preferencia de moneda, auditoría, y las tablas
del sistema de códigos (`otp_limits`, `otp_test_challenges`, `otp_sms_log`). Existen además 22
funciones de servidor: pedidos con saldo, reembolso, depósitos v1/v2, retiros, revisión
administrativa, liberación de línea, publicación y lectura cifrada de cuentas, inscripción y sala de
eventos, referidos, moneda, recargas más vendidas y `has_role`.

**Contenido de datos: todo a 0** (0 usuarios, 0 perfiles, 0 wallets, 0 movimientos, 0 juegos,
0 ofertas, 0 pedidos, 0 depósitos, 0 retiros, 0 eventos, 0 publicaciones, 0 ajustes, 0 auditorías).
El backend es funcional pero **vacío**: falta la configuración inicial de la plataforma y el catálogo.

## 5. Estado de Storage

Cuatro buckets, **los cuatro privados**: `avatars`, `catalog`, `deposit-proofs`, `listings`. La
lectura de archivos privados se hace con enlaces temporales firmados (una hora). No hay dependencia
del almacenamiento externo.

## 6. Estado de RLS

Protección por filas **activa en las 29 tablas**. Las tablas de usuario tienen políticas por dueño y
las administrativas se apoyan en el rol. Las tres tablas del sistema de códigos
(`otp_limits`, `otp_test_challenges`, `otp_sms_log`) tienen protección activa **y cero políticas**,
es decir, quedan cerradas al navegador y solo accesibles desde el servidor: es lo correcto.

## 7. Estado de Realtime

**No hay ninguna tabla publicada en tiempo real y el código no abre ningún canal**; las pantallas se
actualizan por consulta y refresco. No existe tiempo real entre bases distintas. Si más adelante se
quiere aviso inmediato en fondos, retiros, eventos o notificaciones, habrá que habilitarlo dentro de
Lovable Cloud (pendiente, no bloqueante).

## 8. Estado de GitHub

**No hay ningún repositorio de GitHub conectado.** El código vive en el repositorio interno gestionado
por Lovable (rama de trabajo actual `edit/...`, último cambio "Auditoría de solo lectura", árbol
limpio). Para cumplir el objetivo de respaldo hace falta una acción del usuario, no del código:
conectar GitHub desde el menú "+" del chat → GitHub → conectar proyecto, autorizar la aplicación de
Lovable y crear el repositorio. A partir de ahí la sincronización es automática en ambos sentidos. No
se sobrescribió ni creó nada.

## 9. Dependencias externas

| Elemento | Clasificación | Estado |
| --- | --- | --- |
| Lovable Cloud (datos, acceso, archivos, funciones, publicación) | necesaria y válida | en uso |
| Proyecto externo `nklgztbukgaoycuaryzk` | fuera del runtime | sin uso en código |
| Backend antiguo `yfimkckjhhvxkbkyxexd` | histórico | sin uso en código |
| zdSMS | pendiente | no conectado |
| G2Bulk | pendiente | no conectado, sin clave |
| GitHub | pendiente | no conectado |

No existe Hostinger ni ningún otro servidor añadido.

## 10. Referencias al Supabase externo

Búsqueda en todo el proyecto: **0 referencias activas en el código**. El identificador y la URL del
proyecto externo aparecen únicamente en los informes de fases anteriores y en el roadmap, es decir
**A — documental**. No hay configuración histórica activa, ni código activo, ni dependencia de
ejecución. La aplicación de producción **no depende** del proyecto externo.

## 11. Estado de secrets

| Secreto | Usado | Propósito | Acción propuesta |
| --- | --- | --- | --- |
| `MONSTORE_OTP_PEPPER` | **sí** | protege los hashes de los códigos de acceso en el servidor | **conservar** |
| `MONSTORE_DB_URL` | no | dirección del proyecto externo | conservar por ahora; futuro respaldo |
| `MONSTORE_DB_PUBLISHABLE_KEY` | no | clave pública del externo | conservar por ahora |
| `MONSTORE_DB_SERVICE_KEY` | no | clave administrativa del externo | conservar; **nunca en el navegador** |
| `MONSTORE_DB_PROJECT_ID` | no | identificador del externo | conservar por ahora |
| `LOVABLE_CRON_SECRET` | sí | tareas programadas internas | conservar |
| `LOVABLE_API_KEY` | sí | servicios de IA de Lovable | conservar |

Ninguno está escrito en el código; ninguno se envía al navegador ni aparece en registros. **No se
eliminó ningún secreto.** Los cuatro `MONSTORE_DB_*` quedan obsoletos para la operación diaria pero
son exactamente los que necesitaría el futuro respaldo externo, por lo que la recomendación es
mantenerlos. Si prefieres borrarlos, hace falta tu autorización expresa.

## 12. Estado del catálogo

**0 juegos y 0 ofertas** en producción. El histórico de 6.193 ofertas (5.070 por ID de jugador,
1.123 por código, 0 personalizadas) sigue únicamente en el backend antiguo, que no es accesible desde
este proyecto. La reconstrucción se hará más adelante con la integración del proveedor. La separación
técnica/comercial y la clasificación aprobada (`via_id`, `codigo`, `via_cuenta` solo para ofertas
personalizadas atendidas por WhatsApp, y comercio como marketplace de cuentas) se mantienen intactas
en el código.

## 13. Estado de precios

La arquitectura de base de precios preparada en la Fase 2.9 permanece sin cambios: el precio de venta,
descuentos, fechas de promoción, destacados, orden y reglas comerciales pertenecen a MonStore, y la
sincronización del proveedor no puede sobrescribirlos (corregido en la Fase 2.8.1). No se recalculó ni
modificó ningún precio.

## 14. Estado del Panel Admin

Una sola aplicación con dos zonas: cliente en `/app/...` y administración en `/admin/...`. La
administración está protegida en tres capas: pantalla, servidor y base de datos. Un cliente normal no
puede entrar, ni consultar información administrativa, ni cambiar ajustes o precios, ni aprobar fondos
o retiros, ni concederse el rol de administrador. La autorización sigue viniendo de la tabla de roles.

## 15. Estado del antiguo Admin Panel

**Archivado como referencia histórica.** No forma parte de esta aplicación, no se recuperó y no debe
volver a ser una segunda aplicación de producción.

## 16. Riesgos

R1 — Sin repositorio de GitHub conectado no existe respaldo del código fuera de Lovable.
R2 — El backend de producción está vacío: sin configuración inicial y sin catálogo no se puede operar.
R3 — Los datos históricos (usuarios reales, wallets, movimientos, depósitos, retiros, pedidos) siguen
en el backend antiguo sin credenciales de lectura; sin ellas no se pueden recuperar.
R4 — El envío de SMS está simulado, por lo que el acceso real de clientes aún no es posible.
R5 — Sin tiempo real, los cambios administrativos se ven solo al refrescar.
R6 — Riesgo de confusión si alguien vuelve a apuntar la aplicación al proyecto externo: quedaría
dinero escrito en dos sitios. Regla firme: una sola base de datos operativa.

## 17. Elementos pendientes

Conectar GitHub; cargar la configuración inicial de la plataforma; integrar el envío real de SMS;
integrar el proveedor del catálogo; decidir qué datos históricos se recuperan y cómo; habilitar tiempo
real si se desea; y, más adelante, implementar la copia de seguridad externa.

## 18. Arquitectura final propuesta

```text
CLIENTE (una sola aplicación: /app y /admin)
      |
      v
LOVABLE CLOUD  ->  base de datos + acceso + archivos + funciones + publicación
      |
      +--> GITHUB            (respaldo del código)
      +--> SUPABASE EXTERNO  (respaldo futuro de datos, solo en un sentido)
```

Nunca: cliente contra dos bases de datos. Nunca: dos bases escribiendo el mismo saldo. Nunca: clave
administrativa en el navegador. La copia externa jamás escribe de vuelta en producción.

## 19. Plan futuro de backup externo

Copia en un solo sentido, programada, desde Lovable Cloud hacia el proyecto externo, con prioridad en
usuarios, perfiles, wallets, saldo disponible y retenido, movimientos, depósitos, retiros, pedidos y
auditoría. Ejecución solo en servidor con la clave administrativa del externo, por lotes idempotentes
identificados, verificada por recuentos y sumas, y sin ninguna ruta de escritura inversa. No
implementado en esta fase.

## 20. Plan futuro de integración G2Bulk

Guardar la clave del proveedor como secreto de servidor; sincronizar únicamente columnas técnicas
(identificadores, coste, disponibilidad, metadatos) con actualización por referencia del proveedor;
crear altas, marcar bajas como no disponibles y **nunca** tocar precio, descuentos, promociones,
destacados, orden ni reglas comerciales; clasificar como `codigo` o `via_id` y nunca como
`via_cuenta`; registrar cada sincronización y permitir previsualización antes de aplicar.

## 21. Plan futuro de integración zdSMS

Primero comprobar que el servidor publicado alcanza el proveedor (la prueba anterior desde desarrollo
agotó el tiempo de conexión); después guardar las credenciales como secretos de servidor, sustituir el
envío simulado por el real conservando los límites ya aprobados (5 códigos por número cada 24 h,
60 s entre solicitudes, 6 dígitos, 5 minutos de validez, 5 intentos, un solo uso, límite por origen),
registrar cada envío sin guardar nunca el código, y validar con un número de prueba antes de abrir el
acceso a clientes.

---

## VEREDICTO

🟡 **ARQUITECTURA LISTA CON PENDIENTES**

La nueva arquitectura ya es real: la aplicación usa exclusivamente Lovable Cloud como backend, sin
ninguna dependencia activa del proyecto externo, sin escritura doble, con protección por filas en
todas las tablas, almacenamiento privado y el panel administrativo protegido en tres capas. El
desarrollo puede continuar sobre esta base. Quedan pendientes, sin bloquear el desarrollo: conectar
GitHub como respaldo del código, cargar la configuración inicial y el catálogo, activar el envío real
de SMS y decidir la recuperación de los datos históricos.

Auditoría detenida, sin modificaciones, a la espera de autorización expresa.
