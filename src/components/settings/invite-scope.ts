/**
 * Regra de alcance do convite, isolada do componente para ser testável: importar
 * o .tsx puxaria o cliente Supabase, que falha (de propósito) sem as env vars.
 *
 * Um convite sem obra dá acesso à organização inteira — tem de ser uma escolha
 * consciente de quem convida, nunca um efeito lateral de não escolher nada.
 */
export function requiresOrgWideConfirmation(opts: {
  role: string;
  lockedSiteId?: string | null;
  selectedSites: string[];
}): boolean {
  if (opts.lockedSiteId) return false;      // convite pré-scoped a uma obra
  if (opts.role === 'admin') return false;  // admin é org-wide por definição
  return opts.selectedSites.length === 0;
}
