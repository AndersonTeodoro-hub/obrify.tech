import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Modelo configuravel — default: o modelo Claude ja usado no projeto. Preparado para upgrade.
const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const SEV_ORDER: Record<string, number> = { alta: 0, media: 1, baixa: 2 };

function buildSystemPrompt(tone: string): string {
  const toneDesc = tone === "projetista"
    ? "'projetista' = coordenacao entre pares"
    : "'fiscalizacao' = parecer firme mas construtivo de fiscal para projetista";
  return `Es um fiscal senior de obras em Portugal. Redige o corpo de um email profissional de coordenacao de projetos comunicando as incompatibilidades listadas. Estrutura: saudacao formal; paragrafo de enquadramento (obra, ambito da analise); lista numerada dos pontos por ordem de gravidade, cada um com descricao tecnica concisa e accao solicitada; paragrafo final com prazo/proximo passo; despedida formal. Tom ${toneDesc}. Portugues europeu. Nao inventes dados alem dos findings fornecidos. Responde APENAS com o texto do email, sem markdown.`;
}

async function callClaude(apiKey: string, systemPrompt: string, userContent: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: [{ type: "text", text: userContent }] }],
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API ${response.status}: ${errText}`);
  }
  const result = await response.json();
  if (result.stop_reason === "max_tokens") {
    throw new Error("Resposta truncada pela API (max_tokens) - demasiados findings para um so email.");
  }
  const text = (result.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
  if (!text) throw new Error("A API devolveu um email vazio.");
  return text;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { obra_id, finding_ids, tone } = await req.json();
    if (!obra_id) throw new Error("obra_id em falta");
    if (!Array.isArray(finding_ids) || finding_ids.length === 0) throw new Error("finding_ids em falta");
    const toneVal = tone === "projetista" ? "projetista" : "fiscalizacao";

    // Posse da obra + contexto/nome
    const { data: obra, error: obraErr } = await supabase
      .from("incompaticheck_obras").select("user_id, nome, analysis_context").eq("id", obra_id).single();
    if (obraErr || !obra) throw new Error(`Obra nao encontrada: ${obraErr?.message || obra_id}`);
    if (obra.user_id !== user.id) throw new Error("Sem permissao sobre esta obra");

    // Carrega findings das duas tabelas, filtrando por ids + obra
    const { data: cross } = await supabase
      .from("incompaticheck_cross_findings")
      .select("severity, title, description, recommendation, location, especialidade_a, especialidade_b")
      .eq("obra_id", obra_id).in("id", finding_ids);
    const { data: self } = await supabase
      .from("incompaticheck_self_findings")
      .select("severity, title, description, recommendation, location, especialidade")
      .eq("obra_id", obra_id).in("id", finding_ids);

    const all = [
      ...(cross || []).map((f: any) => ({ ...f, par: `${f.especialidade_a} x ${f.especialidade_b}` })),
      ...(self || []).map((f: any) => ({ ...f, par: `${f.especialidade} (coerencia interna)` })),
    ];
    if (all.length === 0) throw new Error("Nenhum finding encontrado para os ids indicados.");
    all.sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));

    const listText = all.map((f, i) =>
      `${i + 1}. [${(f.severity || "").toUpperCase()}] ${f.title} (${f.par})${f.location ? ` - Local: ${f.location}` : ""}\n   ${f.description}${f.recommendation ? `\n   Accao: ${f.recommendation}` : ""}`
    ).join("\n\n");

    const userContent =
      `OBRA: ${obra.nome}\n` +
      `CONTEXTO DA OBRA: ${(obra.analysis_context ?? "").trim() || "(nenhum contexto definido)"}\n\n` +
      `INCOMPATIBILIDADES A COMUNICAR (por ordem de gravidade):\n${listText}`;

    const email_body = await callClaude(anthropicKey, buildSystemPrompt(toneVal), userContent);

    return new Response(JSON.stringify({ email_body }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error("REPORT-EMAIL ERROR:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
