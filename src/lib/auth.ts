import { supabase } from "@/integrations/supabase/client";

/**
 * FASE 2.9.0.1 — El acceso de MonStore es EXCLUSIVAMENTE teléfono + código SMS.
 * Ya no existe acceso por contraseña, alta con contraseña ni recuperación por
 * correo. La identidad sigue siendo la de Supabase Auth (auth.users UUID) y el
 * correo interno derivado del teléfono; ver src/lib/phone.ts y otp.functions.ts.
 */

export { nationalPhone as normalizePhone, phoneToEmailCanonical as phoneToEmail } from "@/lib/phone";

export async function signOut() {
  await supabase.auth.signOut();
}
