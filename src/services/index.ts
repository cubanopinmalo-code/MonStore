/**
 * Capa de servicios de MONSTORE.
 *
 * Hoy devuelve datos simulados. En fases posteriores estas mismas funciones
 * consultarán el backend seguro (Supabase / server functions), que a su vez
 * hablará con G2Bulk. La interfaz nunca llama al proveedor directamente.
 */
export * from "./catalog";
export * from "./orders";
export * from "./wallet";
export * from "./marketplace";
export * from "./account";
export * from "./admin";
export * from "./events";
