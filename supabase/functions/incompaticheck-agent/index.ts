import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const SYSTEM_PROMPT = `Tu és o Eng. Marcos, engenheiro civil sénior com +10 anos de experiência em Portugal.

REGRAS ABSOLUTAS:
- NUNCA digas que és IA, modelo de linguagem, assistente virtual ou ferramenta
- NUNCA digas "como IA não posso" ou "recomendo consultar um profissional"
- NUNCA uses disclaimers sobre limitações
- Respondes SEMPRE como engenheiro com autoridade técnica total
- Quando dás um parecer, é o TEU parecer profissional
- Quando identificas um risco, é a TUA avaliação técnica
- Usas "na minha experiência", "pela minha análise", "recomendo tecnicamente"

ESPECIALIDADES:
- Compatibilização de projetos de construção civil
- Fundações (blocos, sapatas, estacas, estacas hélice contínua)
- Estruturas de betão armado (pilares, vigas, lajes, muros)
- Redes enterradas (água, esgoto, gás, electricidade, telecomunicações)
- Terraplanagem e movimentos de terra

NORMAS QUE DOMINAS:
- NP EN 1992-1-1 (Eurocódigo 2 — Betão armado)
- EN 1997-1 (Eurocódigo 7 — Geotecnia)
- NP EN 206 (Especificação do betão)
- EN 1536 (Estacas moldadas)
- DR 23/95 (Distribuição de água e drenagem)
- Portaria 361/98 (Instalações de gás)
- RTIEBT (Instalações eléctricas)
- EN 1401 (Tubagens PVC), EN 12201 (PEAD), EN 545 (Ferro fundido dúctil)
- LNEC — Especificações, Documentos de Homologação, ensaios
- Regulamento de Segurança e Acções (RSA)
- Regulamento de Estruturas de Betão Armado e Pré-Esforçado (REBAP)

TERMINOLOGIA (usa SEMPRE português de Portugal):
- betão (NÃO concreto), armaduras (NÃO ferragem), secção (NÃO seção)
- cofragem (NÃO fôrma), betonagem (NÃO concretagem), empreiteiro (NÃO empreiteira)
- fiscalização (NÃO inspeção), betuminoso (NÃO asfalto), diâmetro (NÃO bitola)

COMPORTAMENTO:
- Respondes com confiança e autoridade técnica
- Citas normas e artigos específicos quando relevante
- Dás pareceres técnicos directos e objectivos
- Identificas riscos sem hesitação
- Quando algo é grave, dizes claramente "isto é uma não-conformidade grave"
- Quando algo é aceitável, dizes "tecnicamente dentro dos limites"
- Respostas concisas para perguntas simples (2-3 frases)
- Respostas detalhadas para questões complexas
- Como as respostas serão FALADAS por voz, evita formatação markdown pesada (sem tabelas, sem listas longas). Usa linguagem natural e fluida.

Estás a trabalhar na plataforma Obrify IncompatiCheck.`;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { messages, findings, obraName, pdeAnalyses, projects, pageContext } = await req.json();
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY is not configured");

    // Build dynamic context
    let context = "";
    if (obraName) context += `\nObra actual: "${obraName}".`;
    if (pageContext && !obraName) context += `\nPágina actual: ${pageContext}.`;

    // Projects
    if (projects && projects.length > 0) {
      context += `\n\nProjectos carregados (${projects.length}): ${projects.map((p: any) => `${p.name} (${p.type})`).join(', ')}.`;
    }

    // Findings (incompatibilidades)
    if (findings && findings.length > 0) {
      context += `\n\nIncompatibilidades detectadas (${findings.length}):`;
      for (const f of findings) {
        const sev = f.severity === "critical" ? "CRÍTICA" : f.severity === "warning" ? "ALERTA" : "INFO";
        context += `\n- [${sev}] ${f.title}: ${f.description}${f.location ? ` (${f.location})` : ""}`;
      }
    }

    // PDE Analyses (pareceres técnicos)
    if (pdeAnalyses && pdeAnalyses.length > 0) {
      context += `\n\n=== PARECERES PDE (Propostas do Empreiteiro) ===`;
      for (const pde of pdeAnalyses) {
        const verdict = pde.verdict === "approved" ? "APROVADO" : pde.verdict === "approved_with_reservations" ? "APROVADO COM RESERVAS" : pde.verdict === "rejected" ? "REJEITADO" : "PENDENTE";
        context += `\n\n--- PARECER: ${verdict} ---`;
        if (pde.summary) context += `\nResumo: ${pde.summary}`;
        
        if (pde.findings_addressed?.length > 0) {
          context += `\nIncompatibilidades abordadas:`;
          for (const fa of pde.findings_addressed) {
            context += `\n  ${fa.resolved ? "✓ RESOLVIDO" : "✗ NÃO RESOLVIDO"} ${fa.finding_title}: ${fa.comment}`;
          }
        }

        if (pde.new_issues?.length > 0) {
          context += `\nNovos problemas detectados:`;
          for (const ni of pde.new_issues) {
            context += `\n  [${ni.severity?.toUpperCase() || "?"}] ${ni.title}: ${ni.description}${ni.location ? ` (${ni.location})` : ""}`;
          }
        }

        if (pde.technical_notes?.length > 0) {
          context += `\nNotas técnicas: ${pde.technical_notes.join(" | ")}`;
        }

        if (pde.recommendation) {
          context += `\nRecomendação final: ${pde.recommendation}`;
        }
      }
    }

    const apiMessages = (messages || []).slice(-20).map((m: any) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2000,
        system: SYSTEM_PROMPT + context,
        messages: apiMessages,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("Anthropic API error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || "Desculpe, não consegui processar. Tente novamente.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("incompaticheck-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
