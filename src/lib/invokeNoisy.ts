import { supabase } from '@/integrations/supabase/client';

// Invoca uma edge function e falha RUIDOSAMENTE com a mensagem completa do body (HTTP 500).
// supabase.functions.invoke esconde o corpo do erro em error.context — extraimo-lo aqui.
export async function invokeNoisy(fn: string, body: unknown): Promise<any> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let detail = error.message;
    const ctx = (error as any).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = await ctx.json();
        if (j?.error) detail = j.error;
      } catch { /* mantem a mensagem original */ }
    }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
