import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_FILE_SIZE = 22 * 1024 * 1024;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { projects } = await req.json();

    if (!projects || projects.length < 2) {
      throw new Error("Mínimo 2 projectos para análise");
    }

    console.log(`INCOMPATICHECK: Analyzing ${projects.length} projects`);

    const projectContents: { name: string; type: string; base64: string; size: number; skipped: boolean; skipReason?: string }[] = [];

    for (const project of projects) {
      console.log(`INCOMPATICHECK: Downloading ${project.name} (${project.type})`);

      const { data: fileData, error: fileError } = await supabase.storage
        .from("incompaticheck-files")
        .download(project.file_path);

      if (fileError || !fileData) {
        console.error(`INCOMPATICHECK: Failed to download ${project.name}:`, fileError);
        projectContents.push({
          name: project.name,
          type: project.type,
          base64: "",
          size: 0,
          skipped: true,
          skipReason: "Erro ao descarregar ficheiro",
        });
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

      projectContents.push({
        name: project.name,
        type: project.type,
        base64,
        size: fileSize,
        skipped: false,
      });
    }

    const validProjects = projectContents.filter((p) => !p.skipped && p.base64.length > 0);

    if (validProjects.length < 2) {
      throw new Error("Não foi possível processar ficheiros suficientes. Verifique que os PDFs foram carregados correctamente.");
    }

    const totalBase64Size = validProjects.reduce((sum, p) => sum + p.base64.length, 0);
    const totalMB = totalBase64Size / 1024 / 1024;
    console.log(`INCOMPATICHECK: Total payload size: ${totalMB.toFixed(1)}MB base64 from ${validProjects.length} files`);

    let findings: any[] = [];

    if (totalMB > 80) {
      console.log("INCOMPATICHECK: Large payload — analyzing in pairs");

      for (let i = 0; i < validProjects.length; i++) {
        for (let j = i + 1; j < validProjects.length; j++) {
          const pairA = validProjects[i];
          const pairB = validProjects[j];
          console.log(`INCOMPATICHECK: Analyzing pair: ${pairA.name} vs ${pairB.name}`);

          const content: any[] = [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pairA.base64 } },
            { type: "text", text: `[Documento acima: "${pairA.name}" — Especialidade: ${pairA.type}]` },
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pairB.base64 } },
            { type: "text", text: `[Documento acima: "${pairB.name}" — Especialidade: ${pairB.type}]` },
            { type: "text", text: getAnalysisPrompt(2) },
          ];

          const pairResult = await callClaude(anthropicKey, content);
          if (pairResult && pairResult.length > 0) {
            const prefixed = pairResult.map((f: any, idx: number) => ({
              ...f,
              id: `INC-${i}${j}-${String(idx + 1).padStart(3, "0")}`,
            }));
            findings = [...findings, ...prefixed];
          }
        }
      }
    } else {
      console.log("INCOMPATICHECK: Normal payload — analyzing all at once");

      const content: any[] = [];
      for (const doc of validProjects) {
        content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: doc.base64 } });
        content.push({ type: "text", text: `[Documento acima: "${doc.name}" — Especialidade: ${doc.type}]` });
      }
      content.push({ type: "text", text: getAnalysisPrompt(validProjects.length) });

      findings = await callClaude(anthropicKey, content);
    }

    const uniqueFindings = deduplicateFindings(findings);
    console.log(`INCOMPATICHECK: Found ${uniqueFindings.length} unique incompatibilities`);

    const skippedFiles = projectContents.filter((p) => p.skipped);

    return new Response(
      JSON.stringify({
        findings: uniqueFindings,
        analyzed_at: new Date().toISOString(),
        projects_analyzed: validProjects.map((p) => ({ name: p.name, type: p.type, size_mb: (p.size / 1024 / 1024).toFixed(1) })),
        skipped_files: skippedFiles.map((p) => ({ name: p.name, reason: p.skipReason })),
        strategy: totalMB > 80 ? "pairs" : "all_at_once",
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

Para cada incompatibilidade encontrada, responde APENAS com um JSON array (sem markdown, sem backticks, sem texto antes ou depois) com objectos neste formato exacto:

[
  {
    "id": "INC-001",
    "severity": "alta",
    "title": "Título curto da incompatibilidade",
    "description": "Descrição detalhada do conflito identificado",
    "specialties": ["Estrutural", "Fundações"],
    "location": "Referência à localização no projecto (ex: Eixo B, Pilar P3, Cota -2.50)",
    "recommendation": "Recomendação prática para resolver",
    "zone": {
      "description": "Zona central-esquerda da planta, junto ao eixo B entre pilares P3 e P5",
      "x_percent": 35,
      "y_percent": 50,
      "radius_percent": 15,
      "source_project": "nome-do-ficheiro.pdf"
    }
  }
]

Regras:
- severity: "alta" (conflito estrutural, segurança), "media" (conflito funcional, pode causar problemas), "baixa" (inconsistência menor, documentação)
- Sê específico nas localizações e referências aos documentos
- Se encontrares cotas conflituantes, dimensões incompatíveis, sobreposições de redes com fundações, conflitos de infraestruturas com elementos estruturais — reporta tudo
- Se os documentos forem plantas, analisa visualmente as sobreposições e conflitos geométricos
- Se forem memórias descritivas, compara especificações, materiais, dimensões, cotas
- Foca especialmente em: redes enterradas que atravessam sapatas ou lintéis, cotas de fundo de tubagem vs cotas de fundação, caixas de visita em conflito com elementos estruturais, passagens de cabos ou tubagens que conflituam com armaduras
- Se não encontrares incompatibilidades claras, devolve um array com uma entrada de severity "baixa" a indicar que não foram detectados conflitos significativos
- Para cada incompatibilidade, inclui um campo "zone" que indica a zona aproximada na planta onde o conflito ocorre:
  - description: descrição textual da zona
  - x_percent: posição horizontal aproximada em percentagem (0=esquerda, 100=direita)
  - y_percent: posição vertical aproximada em percentagem (0=topo, 100=fundo)
  - radius_percent: raio aproximado da zona afectada em percentagem da largura da planta (10=pequena, 30=grande)
  - source_project: nome do ficheiro de projecto mais relevante para visualizar esta incompatibilidade
  Não precisas de ser exacto — indica a zona abrangente onde o especialista deve verificar.
- Responde APENAS com o JSON array, nada mais`;
}

async function callClaude(apiKey: string, content: any[]): Promise<any[]> {
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
      system: `És um engenheiro civil sénior especialista em fiscalização e detecção de incompatibilidades entre projectos de diferentes especialidades em obras de construção civil em Portugal. Conheces profundamente os Eurocódigos, normas portuguesas (REBAP, RSA, RGEU, RJUE), e tens 30+ anos de experiência a cruzar projectos de fundações, estrutura, redes enterradas, AVAC, electricidade e arquitectura. A tua função é analisar projectos e identificar conflitos, sobreposições, e inconsistências. Sê rigoroso e específico. Responde sempre em português europeu.`,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("INCOMPATICHECK: Claude API error:", errText);
    return [];
  }

  const result = await response.json();
  const replyText = result.content?.[0]?.text || "[]";

  try {
    const cleaned = replyText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned);
  } catch (parseErr) {
    console.error("INCOMPATICHECK: Failed to parse:", replyText.substring(0, 200));
    return [];
  }
}

function deduplicateFindings(findings: any[]): any[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = f.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
