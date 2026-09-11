import { supabase } from "@/integrations/supabase/client";

/** El acceso es solo con teléfono: se deriva un correo interno estable. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function phoneToEmail(phone: string): string {
  return `${normalizePhone(phone)}@telefono.monstore.cu`;
}

export async function signInWithPhone(phone: string, password: string) {
  return supabase.auth.signInWithPassword({
    email: phoneToEmail(phone),
    password,
  });
}

export async function signUpWithPhone(params: {
  phone: string;
  password: string;
  name: string;
  referralCode?: string | undefined;
}) {
  const data: Record<string, string> = {
    name: params.name,
    phone: normalizePhone(params.phone),
  };
  if (params.referralCode) data['referral_code'] = params.referralCode.toUpperCase();

  return supabase.auth.signUp({
    email: phoneToEmail(params.phone),
    password: params.password,
    options: { data },
  });
}

export async function signOut() {
  await supabase.auth.signOut();
}
