import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const MAX_FILE_SIZE = 22 * 1024 * 1024;

interface KnowledgeData {
  project_name: string;
  specialty: string;
  summary: string;
  key_elements: any[];
}

interface Aggregated {
  summary: any | null;
  email_response: any | null;
  analysis_limitations: string[];
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { projects, knowledge_data, empreiteiro_email_image, empreiteiro_email_mime, email_context } = await req.json();
    const emailImage = empreiteiro_email_image || null;
    const emailMime = empreiteiro_email_mime || "image/jpeg";
    const emailCtx = email_context || "generic";

    if (!projects || projects.length < 2) {
      throw new Error("Mínimo 2 projectos para análise");
    }

    console.log(`INCOMPATICHECK: Analyzing ${projects.length} projects, knowledge_data: ${knowledge_data?.length || 0} entries, email: ${emailImage ? "yes" : "no"}`);

    // Separate projects into those with knowledge and those without
    const knowledgeMap = new Map<string, KnowledgeData>();
    if (knowledge_data && Array.isArray(knowledge_data)) {
      for (const k of knowledge_data) {
        if (k.summary && k.key_elements?.length > 0) {
          knowledgeMap.set(k.project_name, k);
        }
      }
    }

    const projectsWithKnowledge: { name: string; type: string; knowledge: KnowledgeData }[] = [];
    const projectsToDownload: typeof projects = [];

    for (const project of projects) {
      const knowledge = knowledgeMap.get(project.name);
      if (knowledge) {
        projectsWithKnowledge.push({ name: project.name, type: project.type, knowledge });
      } else {
        projectsToDownload.push(project);
      }
    }

    console.log(`INCOMPATICHECK: ${projectsWithKnowledge.length} with knowledge, ${projectsToDownload.length} need PDF download`);

    const projectContents: { name: string; type: string; base64: string; size: number; skipped: boolean; skipReason?: string }[] = [];

    for (const project of projectsToDownload) {
      console.log(`INCOMPATICHECK: Downloading ${project.name} (${project.type})`);

      const { data: fileData, error: fileError } = await supabase.storage
        .from("incompaticheck-files")
        .download(project.file_path);

      if (fileError || !fileData) {
        console.error(`INCOMPATICHECK: Failed to download ${project.name}:`, fileError);
        projectContents.push({ name: project.name, type: project.type, base64: "", size: 0, skipped: true, skipReason: "Erro ao descarregar ficheiro" });
        continue;
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const fileSize = arrayBuffer.byteLength;
      console.log(`INCOMPATICHECK: ${project.name} size: ${(fileSize / 1024 / 1024).toFixed(1)}MB`);

      if (fileSize > MAX_FILE_SIZE) {
        console.warn(`INCOMPATICHECK: ${project.name} too large (${(fileSize / 1024 / 1024).toFixed(1)}MB). Will attempt but may fail.`);
      }

      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const base64 = btoa(binary);

      projectContents.push({ name: project.name, type: project.type, base64, size: fileSize, skipped: false });
    }

    const validPdfProjects = projectContents.filter((p) => !p.skipped && p.base64.length > 0);
    const totalProjects = validPdfProjects.length + projectsWithKnowledge.length;

    if (totalProjects < 2) {
      throw new Error("Não foi possível processar ficheiros suficientes. Verifique que os PDFs foram carregados correctamente.");
    }

    const totalBase64Size = validPdfProjects.reduce((sum, p) => sum + p.base64.length, 0);
    const totalMB = totalBase64Size / 1024 / 1024;
    console.log(`INCOMPATICHECK: PDF payload: ${totalMB.toFixed(1)}MB from ${validPdfProjects.length} files, ${projectsWithKnowledge.length} from knowledge`);

    let findings: any[] = [];
    let aggregated: Aggregated = { summary: null, email_response: null, analysis_limitations: [] };

    const buildKnowledgeContent = () => {
      const blocks: any[] = [];
      for (const pk of projectsWithKnowledge) {
        const elementsText = (pk.knowledge.key_elements || [])
          .map((el: any) => {
            if (typeof el === 'string') return `- ${el}`;
            const parts = [el.type, el.id, el.details || el.description].filter(Boolean);
            return `- ${parts.join(': ')}`;
          })
          .join('\n');

        blocks.push({
          type: "text",
          text: `[Projecto: "${pk.name}" — Especialidade: ${pk.type}]\nRESUMO TÉCNICO (processado pela Base de Conhecimento):\n${pk.knowledge.summary}\n\nELEMENTOS-CHAVE IDENTIFICADOS:\n${elementsText}\n---`,
        });
      }
      return blocks;
    };

    const buildEmailBlocks = () => {
      if (!emailImage) return [];
      return [
        {
          type: emailMime === "application/pdf" ? "document" : "image",
          source: { type: "base64", media_type: emailMime, data: emailImage },
        },
        {
          type: "text",
          text: `[EMAIL RECEBIDO — print/screenshot do email que acompanha os projectos. Contexto: ${emailCtx}. Lê o remetente, o tom, como se dirige, e usa esta informação para adaptar o email de resposta. Se não houver email, gera uma comunicação padrão.]`,
        },
      ];
    };

    if (totalMB > 80 && validPdfProjects.length > 1) {
      console.log("INCOMPATICHECK: Large PDF payload — analyzing in pairs with knowledge context");

      const knowledgeBlocks = buildKnowledgeContent();
      const emailBlocks = buildEmailBlocks();
      const pairSummaries: any[] = [];
      const pairEmails: any[] = [];
      const allLimitations: string[] = [];

      for (let i = 0; i < validPdfProjects.length; i++) {
        for (let j = i + 1; j < validPdfProjects.length; j++) {
          const pairA = validPdfProjects[i];
          const pairB = validPdfProjects[j];
          console.log(`INCOMPATICHECK: Analyzing pair: ${pairA.name} vs ${pairB.name}`);

          const content: any[] = [
            ...emailBlocks,
            ...knowledgeBlocks,
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pairA.base64 } },
            { type: "text", text: `[Documento acima: "${pairA.name}" — Especialidade: ${pairA.type}]` },
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pairB.base64 } },
            { type: "text", text: `[Documento acima: "${pairB.name}" — Especialidade: ${pairB.type}]` },
            { type: "text", text: getAnalysisPrompt(totalProjects) },
          ];

          const pairResult = await callClaude(anthropicKey, content);
          const pairFindings = Array.isArray(pairResult?.findings) ? pairResult.findings : [];
          if (pairFindings.length > 0) {
            const prefixed = pairFindings.map((f: any, idx: number) => ({
              ...f,
              id: `INC-${i}${j}-${String(idx + 1).padStart(3, "0")}`,
            }));
            findings = [...findings, ...prefixed];
          }
          if (pairResult?.summary) pairSummaries.push(pairResult.summary);
          if (pairResult?.email_response) pairEmails.push(pairResult.email_response);
          if (Array.isArray(pairResult?.analysis_limitations)) allLimitations.push(...pairResult.analysis_limitations);
        }
      }

      aggregated = {
        summary: aggregateSummaries(pairSummaries, findings),
        email_response: pairEmails.length > 3
          ? consolidateEmails(pairEmails)
          : (pairEmails[pairEmails.length - 1] || null),
        analysis_limitations: Array.from(new Set(allLimitations)),
      };
    } else {
      console.log("INCOMPATICHECK: Analyzing all at once");

      const content: any[] = [];
      content.push(...buildEmailBlocks());
      content.push(...buildKnowledgeContent());
      for (const doc of validPdfProjects) {
        content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: doc.base64 } });
        content.push({ type: "text", text: `[Documento acima: "${doc.name}" — Especialidade: ${doc.type}]` });
      }
      content.push({ type: "text", text: getAnalysisPrompt(totalProjects) });

      const result = await callClaude(anthropicKey, content);
      findings = Array.isArray(result?.findings) ? result.findings : [];
      aggregated = {
        summary: result?.summary || null,
        email_response: result?.email_response || null,
        analysis_limitations: Array.isArray(result?.analysis_limitations) ? result.analysis_limitations : [],
      };
    }

    const uniqueFindings = deduplicateFindings(findings);
    console.log(`INCOMPATICHECK: Found ${uniqueFindings.length} unique incompatibilities`);

    const skippedFiles = projectContents.filter((p) => p.skipped);

    return new Response(
      JSON.stringify({
        findings: uniqueFindings,
        summary: aggregated.summary,
        email_response: aggregated.email_response,
        analysis_limitations: aggregated.analysis_limitations,
        analyzed_at: new Date().toISOString(),
        projects_analyzed: [
          ...validPdfProjects.map((p) => ({ name: p.name, type: p.type, size_mb: (p.size / 1024 / 1024).toFixed(1) })),
          ...projectsWithKnowledge.map((p) => ({ name: p.name, type: p.type, size_mb: "knowledge" })),
        ],
        skipped_files: skippedFiles.map((p) => ({ name: p.name, reason: p.skipReason })),
        strategy: totalMB > 80 && validPdfProjects.length > 1 ? "pairs" : "all_at_once",
        knowledge_used: projectsWithKnowledge.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("INCOMPATICHECK ERROR:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getAnalysisPrompt(projectCount: number): string {
  return `Analisa os ${projectCount} projectos de especialidades acima e identifica TODAS as incompatibilidades entre eles.

COMO ABORDAR ESTA ANÁLISE:

Passo 1 — Identifica o que tens.
Lista mentalmente os projectos: que especialidades são, que zona do edifício cobrem, que nível de detalhe têm (planta, corte, memória descritiva, mapa de quantidades). Projectos apresentados como resumos da Base de Conhecimento têm informação parcial — usa o que houver mas nota as limitações.

Passo 2 — Cruza geometria.
Verifica se as cotas, eixos, dimensões de elementos e níveis de piso são consistentes entre especialidades. Qualquer desfasamento aqui é crítico.

Passo 3 — Procura conflitos físicos.
Para cada par de especialidades, verifica se há elementos que querem ocupar o mesmo espaço. Foca-te especialmente em:
- Intersecções entre redes (águas, esgotos, AVAC, electricidade, incêndio, gás) e elementos estruturais (vigas, pilares, lajes, sapatas, muros)
- Intersecções entre redes de diferentes especialidades
- Equipamentos que precisam de condições estruturais especiais
- Espaço disponível entre laje e tecto falso para condutas e tubagens

Passo 4 — Avalia construtibilidade.
Para cada conflito, pensa: isto dá para construir? Há espaço para trabalhar? A sequência de montagem é possível? As tolerâncias são realistas?

Passo 5 — Verifica regulamentar.
Atravessamentos de compartimentação corta-fogo, isolamento acústico, pontes térmicas, pendentes de drenagem.

Passo 6 — Gera o email de resposta.
Olha para o print do email (se fornecido) e gera um corpo de email profissional para comunicar as incompatibilidades detectadas. O tom adapta-se ao contexto:
- Se é fiscalização a responder a projectista: tom de parecer técnico, firme mas construtivo
- Se é gabinete de arquitectura a comunicar a outro projectista: tom de coordenação entre pares
- Se é gestão de obra a comunicar à equipa: tom executivo, focado em impacto e prazos
Se não houver print do email, gera um email padrão de comunicação de incompatibilidades.

FORMATO DA RESPOSTA:
Responde com o JSON estruturado abaixo (sem markdown, sem backticks, sem texto antes ou depois):
{
  "findings": [
    {
      "id": "INC-001",
      "severity": "alta",
      "title": "Título curto e descritivo da incompatibilidade",
      "description": "Descrição detalhada do conflito: que elemento de que especialidade conflitua com que elemento de que especialidade, com cotas e dimensões concretas.",
      "impact": "Impacto prático: o que acontece se isto não for resolvido antes da execução. Em linguagem de obra, não de norma.",
      "specialties": ["Estrutural", "AVAC"],
      "location": "Localização PRECISA: eixo, pilar/viga, cota, piso. Ex: Eixo C, entre P12 e P13, cota -3.20, Piso -1",
      "recommendation": "Solução prática e concreta. Não 'consultar o projectista' — sim 'prever negativo de 200mm na viga V12 para passagem da conduta DN150, com reforço de armadura conforme EC2 cl. 6.2'.",
      "constructability_note": "Nota de construtibilidade: como isto afecta a sequência de obra, tolerâncias, ou acesso para trabalho.",
      "zone": {
        "description": "Descrição precisa da zona na planta",
        "x_percent": 35,
        "y_percent": 50,
        "radius_percent": 5,
        "source_project": "nome-do-ficheiro.pdf"
      },
      "conflicting_projects": ["ficheiro-A.pdf", "ficheiro-B.pdf"]
    }
  ],
  "summary": {
    "total_findings": 5,
    "critical": 2,
    "medium": 2,
    "low": 1,
    "overall_assessment": "Avaliação geral em 2-3 frases: os projectos estão compatíveis/têm conflitos graves/precisam de coordenação. Foco no impacto para a obra.",
    "priority_action": "A acção mais urgente que precisa de acontecer: ex: 'Resolver os conflitos de cota entre estrutura e arquitectura no Bloco 1 antes de avançar com a cofragem do Piso 2'"
  },
  "email_response": {
    "context": "fiscal_to_projectist",
    "to_name": "Nome do destinatário (se extraído do print do email)",
    "subject_suggestion": "Re: [assunto] — Parecer sobre compatibilidade de projectos",
    "body": "Corpo do email adaptado ao contexto. REGRAS: máximo 10-15 linhas. Começa com saudação. Indica quantas incompatibilidades foram detectadas e quantas são críticas. Não lista todas — destaca as 2-3 mais graves com linguagem simples. Indica prazo ou urgência se aplicável. Fecha com acção esperada ('Agradecemos resolução das incompatibilidades críticas até à próxima reunião de coordenação'). NUNCA incluas coordenadas, percentagens, IDs técnicos ou jargão que não pertence a um email. Tom profissional mas humano."
  },
  "analysis_limitations": [
    "Limitação 1: ex: 'Projectos de AVAC e electricidade não fornecidos — conflitos com estas especialidades não foram verificados'",
    "Limitação 2: ex: 'Resumos da Base de Conhecimento usados para estrutura — detalhes de armaduras não verificáveis sem plantas de pormenor'"
  ]
}

REGRAS DE FIABILIDADE (INVIOLÁVEIS):
- NUNCA inventes eixos, cotas, números de pilares, ou referências que não existam nos documentos.
- O campo "conflicting_projects" deve conter os nomes EXACTOS dos ficheiros fornecidos.
- Se um projecto é apresentado como resumo da Base de Conhecimento (texto, não PDF), indica essa limitação na análise.
- Se não consegues localizar com precisão (porque o documento é uma memória descritiva sem plantas), indica zone como null e explica porquê.
- Na descrição, sê concreto: "A conduta de retorno de AVAC DN250 à cota +2.85 atravessa a viga V14 (base à cota +2.70, topo à cota +3.30)" — não "há um conflito entre AVAC e estrutura".
- Cada finding deve ter informação suficiente para o projectista perceber EXACTAMENTE o que precisa de resolver, sem ter de re-analisar o projecto.`;
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
      system: `És o engenheiro que todos os gabinetes de projecto e fiscalizações querem ter na equipa — o que pega em 5 projectos de especialidades diferentes, os cruza mentalmente, e em 20 minutos identifica os conflitos que iam aparecer a meio da betonagem e custar 3 semanas de atraso.

Tens mais de 20 anos a cruzar projectos em Portugal. Já viste de tudo: condutas de AVAC que atravessam vigas de betão armado, caixas de visita implantadas em cima de sapatas, redes de incêndio que conflituam com cabos de média tensão, cotas de soleira que não batem entre arquitectura e estrutura. Não te escapa nada porque aprendeste com os erros que viram dinheiro deitado fora.

COMO PENSAS (não é uma checklist — é raciocínio em camadas):

CAMADA 1 — COERÊNCIA GEOMÉTRICA
Antes de mais, perguntas: "Os projectos estão a falar do mesmo edifício?"
- As cotas altimétricas batem entre especialidades? (cota de soleira da arquitectura = cota de laje da estrutura - revestimento?)
- Os eixos estruturais são os mesmos em todas as plantas?
- As dimensões dos elementos são consistentes? (o pilar que a estrutura diz 0.40×0.40 é o mesmo que a arquitectura desenhou com 0.30×0.30?)
- Os níveis de piso coincidem? (a arquitectura diz pé-direito 2.70 mas a estrutura dá 2.80 entre lajes?)
Se os projectos não estão geometricamente alinhados, tudo o resto é construído sobre areia.

CAMADA 2 — CONFLITOS FÍSICOS
Agora procuras sobreposições reais no espaço — elementos de especialidades diferentes que querem ocupar o mesmo sítio:
- Tubagens (águas, esgotos, pluviais, AVAC, sprinklers, gás) que atravessam vigas, pilares, ou lajes sem negativos previstos
- Condutas de AVAC que não cabem no espaço entre a laje estrutural e o tecto falso da arquitectura
- Caixas de visita ou câmaras de inspecção implantadas sobre fundações (sapatas, lintéis, estacas)
- Cabos eléctricos ou esteiras que conflituam com tubagens de outras especialidades
- Redes enterradas exteriores que cruzam fundações ou muros de contenção
- Passagens de tubagens em paredes estruturais sem reforço previsto
- Equipamentos (UTA, chillers, quadros) que precisam de laje reforçada mas a estrutura não prevê

CAMADA 3 — CONSTRUTIBILIDADE
Pensas como quem vai construir:
- A sequência de execução é possível? (consegues montar a armadura se a conduta já lá está?)
- Há espaço para trabalhar? (recobrimentos, afastamentos, acessos para manutenção)
- As tolerâncias de montagem são realistas? (uma tubagem com 2cm de folga à viga não funciona em obra — a viga pode ter 3cm a mais)
- Os atravessamentos de laje têm mangas previstas? Ou vão ser abertos depois com carotagem?
- Os elementos pré-fabricados (se houver) são compatíveis com as reservas das outras especialidades?

CAMADA 4 — REGULAMENTAR E FUNCIONAL
Por fim, verificas conformidade cruzada:
- Resistência ao fogo: os atravessamentos de compartimentos corta-fogo estão selados? As condutas têm registos corta-fogo?
- Acessibilidade: a rede de águas pluviais não bloqueia um acesso técnico exigido pela regulamentação?
- Acústica: condutas de AVAC que atravessam paredes com requisito acústico comprometem o isolamento?
- Térmica: pontes térmicas criadas por elementos estruturais que atravessam a envolvente?
- Drenagem: pendentes de redes compatíveis com a estrutura? (o esgoto precisa de X% mas a laje não dá altura suficiente)

COMO CLASSIFICAS A GRAVIDADE:
- "alta": vai impedir a construção, causar demolição/retrabalho, ou comprometer a segurança estrutural. Exemplos: tubo de esgoto que passa dentro de uma viga, caixa de visita em cima de uma sapata, cota de laje que difere 15cm entre estrutura e arquitectura.
- "media": vai causar problemas em obra que podem ser resolvidos mas com custo e atraso. Exemplos: conduta de AVAC que não cabe no pé-direito disponível, falta de negativos em lajes para passagem de tubagens, equipamento sem reforço de laje.
- "baixa": inconsistência documental que precisa de esclarecimento mas não impede a obra. Exemplos: nomenclatura diferente entre plantas, cotas com arredondamentos diferentes, referências normativas desactualizadas.

REGRAS INVIOLÁVEIS:
- Citas SEMPRE os nomes exactos dos ficheiros onde detectaste o conflito.
- Localizas com PRECISÃO: eixos, pilares, cotas, pisos. "Algures na cave" não serve — "Eixo C entre pilares P12 e P13, cota -3.20" serve.
- Se dois projectos não se sobrepõem (ex: arquitectura de pisos superiores + fundações), dizes que não há conflitos directos mas alertas para possíveis problemas de continuidade vertical.
- Se os projectos são da mesma especialidade em fases diferentes, comparas evolução e alertas para incoerências.
- Se não encontras incompatibilidades reais, não inventas. Devolves severity "baixa" com nota de que os projectos parecem compatíveis nos aspectos analisados.
- NUNCA inventas eixos, cotas, ou referências que não existam nos documentos.

Responde SEMPRE em português europeu.`,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      tool_choice: { type: "auto" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("INCOMPATICHECK: Claude API error:", errText);
    return { findings: [], summary: null, email_response: null, analysis_limitations: [] };
  }

  const result = await response.json();
  const textBlocks = (result.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
  const replyText = textBlocks || "{}";

  try {
    const cleaned = replyText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return { findings: parsed, summary: null, email_response: null, analysis_limitations: [] };
    }
    return parsed;
  } catch (parseErr) {
    console.error("INCOMPATICHECK: Failed to parse:", replyText.substring(0, 200));
    return { findings: [], summary: null, email_response: null, analysis_limitations: [] };
  }
}

function deduplicateFindings(findings: any[]): any[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = (f.title || "").toLowerCase().trim();
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function aggregateSummaries(summaries: any[], findings: any[]): any {
  if (summaries.length === 0 && findings.length === 0) return null;
  const critical = findings.filter((f) => f.severity === "alta").length;
  const medium = findings.filter((f) => f.severity === "media").length;
  const low = findings.filter((f) => f.severity === "baixa").length;
  return {
    total_findings: findings.length,
    critical,
    medium,
    low,
    overall_assessment: summaries.map((s) => s.overall_assessment).filter(Boolean).join(" ").slice(0, 800) || null,
    priority_action: summaries.map((s) => s.priority_action).filter(Boolean)[0] || null,
  };
}

function consolidateEmails(emails: any[]): any {
  const first = emails[0] || {};
  return {
    context: first.context || "generic",
    to_name: first.to_name || null,
    subject_suggestion: first.subject_suggestion || "Parecer sobre compatibilidade de projectos",
    body: emails.map((e) => e.body).filter(Boolean).join("\n\n---\n\n").slice(0, 3000),
  };
}
