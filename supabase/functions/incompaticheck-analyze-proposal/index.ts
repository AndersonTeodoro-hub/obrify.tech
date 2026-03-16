import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_FILE_SIZE = 22 * 1024 * 1024;

interface KnowledgeData {
  project_name: string;
  specialty: string;
  summary: string;
  key_elements: any[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { obra_id, pde_documents, desenho_documents, original_projects, existing_findings, knowledge_data } = await req.json();

    if (!pde_documents?.length && !desenho_documents?.length) {
      throw new Error("É necessário pelo menos 1 PDE ou 1 Desenho de Preparação.");
    }

    console.log(`PDE-ANALYZE: Analyzing ${pde_documents?.length || 0} PDEs + ${desenho_documents?.length || 0} Desenhos vs ${original_projects?.length || 0} projects, knowledge: ${knowledge_data?.length || 0}`);

    // Build knowledge map for original projects
    const knowledgeMap = new Map<string, KnowledgeData>();
    if (knowledge_data && Array.isArray(knowledge_data)) {
      for (const k of knowledge_data) {
        if (k.summary && k.key_elements?.length > 0) {
          knowledgeMap.set(k.project_name, k);
        }
      }
    }

    const downloadFile = async (doc: { file_path: string; name: string }) => {
      const { data, error } = await supabase.storage
        .from("incompaticheck-files")
        .download(doc.file_path);

      if (error || !data) {
        console.error(`PDE-ANALYZE: Failed to download ${doc.name}:`, error);
        return null;
      }

      const arrayBuffer = await data.arrayBuffer();
      const fileSize = arrayBuffer.byteLength;

      if (fileSize > MAX_FILE_SIZE) {
        console.warn(`PDE-ANALYZE: ${doc.name} is ${(fileSize / 1024 / 1024).toFixed(1)}MB — may be large`);
      }

      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      return { name: doc.name, base64: btoa(binary), size: fileSize };
    };

    // Build Claude content
    const content: any[] = [];
    let knowledgeUsed = 0;

    // Original projects: use knowledge when available, PDF otherwise
    for (const p of (original_projects || [])) {
      const knowledge = knowledgeMap.get(p.name);
      if (knowledge) {
        const elementsText = (knowledge.key_elements || [])
          .map((el: any) => {
            if (typeof el === 'string') return `- ${el}`;
            const parts = [el.type, el.id, el.details || el.description].filter(Boolean);
            return `- ${parts.join(': ')}`;
          })
          .join('\n');

        content.push({
          type: "text",
          text: `[Projecto original: "${p.name}" — Especialidade: ${p.type}]\nRESUMO TÉCNICO (Base de Conhecimento):\n${knowledge.summary}\n\nELEMENTOS-CHAVE:\n${elementsText}\n---`,
        });
        knowledgeUsed++;
        console.log(`PDE-ANALYZE: Using knowledge for ${p.name}`);
      } else {
        const result = await downloadFile(p);
        if (result) {
          content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: result.base64 } });
          content.push({ type: "text", text: `[Projecto original acima: "${result.name}" — Especialidade: ${p.type}]` });
        }
      }
    }

    // Existing findings text
    if (existing_findings?.length > 0) {
      const findingsText = existing_findings.map((f: any, i: number) =>
        `${i + 1}. [${f.severity}] ${f.title}: ${f.description}${f.location ? ` (Local: ${f.location})` : ''}`
      ).join('\n');
      content.push({ type: "text", text: `\n--- INCOMPATIBILIDADES PREVIAMENTE DETECTADAS ---\n${findingsText}\n---\n` });
    }

    // PDE documents (always download — these are new)
    const pdeFiles = [];
    for (const d of (pde_documents || [])) {
      const result = await downloadFile(d);
      if (result) pdeFiles.push(result);
    }
    for (const doc of pdeFiles) {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: doc.base64 } });
      content.push({ type: "text", text: `[PDE (Pedido de Esclarecimento) acima: "${doc.name}"]` });
    }

    // Desenho documents (always download — these are new)
    const desenhoFiles = [];
    for (const d of (desenho_documents || [])) {
      const result = await downloadFile(d);
      if (result) desenhoFiles.push(result);
    }
    for (const doc of desenhoFiles) {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: doc.base64 } });
      content.push({ type: "text", text: `[Desenho de Preparação acima: "${doc.name}"]` });
    }

    if (pdeFiles.length === 0 && desenhoFiles.length === 0) {
      throw new Error("Não foi possível processar os ficheiros PDE/Desenhos.");
    }

    // User prompt
    content.push({ type: "text", text: getProposalPrompt() });

    // Call Claude
    const result = await callClaude(anthropicKey, content);

    console.log(`PDE-ANALYZE: Analysis complete — verdict: ${result?.verdict || 'unknown'}, knowledge_used: ${knowledgeUsed}`);

    return new Response(
      JSON.stringify({
        ...result,
        analyzed_at: new Date().toISOString(),
        knowledge_used: knowledgeUsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("PDE-ANALYZE ERROR:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getProposalPrompt(): string {
  return `Analisa a proposta do empreiteiro (PDE + Desenhos de Preparação acima) confrontando com os projectos originais e as incompatibilidades detectadas.

NOTA: Alguns projectos originais são apresentados como resumos técnicos da Base de Conhecimento (texto com elementos-chave), enquanto outros são PDFs completos. Usa TODA a informação disponível.

Responde APENAS com um JSON (sem markdown, sem backticks, sem texto antes ou depois) neste formato exacto:

{
  "verdict": "approved" | "approved_with_reservations" | "rejected",
  "summary": "Resumo geral do parecer em 2-3 frases claras",
  "findings_addressed": [
    {
      "finding_title": "Título da incompatibilidade original",
      "resolved": true,
      "comment": "Como a proposta resolve (ou não resolve) este ponto específico"
    }
  ],
  "new_issues": [
    {
      "severity": "alta",
      "title": "Novo problema criado pela proposta",
      "description": "Descrição detalhada do novo conflito",
      "location": "Localização no projecto"
    }
  ],
  "technical_notes": [
    "Nota técnica sobre dimensionamento, materiais, cotas, etc."
  ],
  "recommendation": "Recomendação final detalhada para o fiscal — o que aprovar, o que pedir para corrigir, o que rejeitar"
}

Regras:
- "approved": Resolve todas as incompatibilidades sem criar novos problemas
- "approved_with_reservations": Resolve parcialmente mas tem pontos a verificar ou pequenas correcções necessárias
- "rejected": Não resolve os problemas ou cria novos conflitos significativos
- Sê específico: referencia cotas, eixos, diâmetros, materiais, dimensões concretas
- Em findings_addressed, mapeia a proposta às incompatibilidades existentes usando títulos e descrições
- Se a proposta não se relaciona com nenhum finding existente, indica isso
- Responde APENAS com o JSON, nada mais`;
}

async function callClaude(apiKey: string, content: any[]): Promise<any> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8000,
      messages: [{ role: "user", content }],
      system: `És um engenheiro civil sénior especialista em fiscalização de obras em Portugal com 30+ anos de experiência. A tua função é analisar PROPOSTAS DE RESOLUÇÃO (PDE e desenhos de preparação) submetidas pelo empreiteiro e confrontá-las com os projectos originais.

Tens acesso a:
1. Os projectos originais de várias especialidades (alguns como PDFs, outros como resumos técnicos da Base de Conhecimento)
2. As incompatibilidades previamente detectadas entre esses projectos
3. O(s) PDE(s) do empreiteiro (pedidos de esclarecimento)
4. Os desenhos de preparação do empreiteiro (proposta de solução)

Analisa se a proposta do empreiteiro:
- Resolve efectivamente as incompatibilidades identificadas
- Não cria novos conflitos com os projectos originais
- Respeita normas e regulamentos (Eurocódigos, normas portuguesas)
- É tecnicamente viável, bem dimensionada e executável
- Mantém coerência com todas as especialidades envolvidas

Responde sempre em português europeu. Sê rigoroso e específico.`,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("PDE-ANALYZE: Claude API error:", errText);
    throw new Error("Erro na análise IA. Tente novamente.");
  }

  const result = await response.json();
  const replyText = result.content?.[0]?.text || "{}";

  try {
    const cleaned = replyText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned);
  } catch (parseErr) {
    console.error("PDE-ANALYZE: Failed to parse:", replyText.substring(0, 200));
    throw new Error("Erro ao processar resposta da IA.");
  }
}
