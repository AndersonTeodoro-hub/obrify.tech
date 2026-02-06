import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SPECIALTY_PROMPTS: Record<string, string> = {
  architecture: `Detecta elementos arquitectónicos: paredes (exteriores e interiores), portas (tipo, dimensão), janelas (tipo, dimensão), escadas, rampas, elevadores, divisões/compartimentos, cotas de nível, áreas.`,
  structure: `Detecta elementos estruturais: pilares (P), vigas (V), lajes, paredes estruturais, fundações, sapatas, muros de suporte, juntas de dilatação, armaduras visíveis.`,
  plumbing: `Detecta elementos de águas e esgotos: tubagens de água fria/quente, tubagens de esgoto, caixas de visita, prumadas, válvulas, contadores, ramais, sifões.`,
  electrical: `Detecta elementos eléctricos: quadros eléctricos (QE), tomadas, interruptores, pontos de luz, caminhos de cabos, esteiras, calhas técnicas, QGBT.`,
  hvac: `Detecta elementos AVAC: condutas (insuflação/retorno), equipamentos (UTA, chiller, split), grelhas, difusores, registos, isolamentos.`,
  gas: `Detecta elementos de gás: tubagens, válvulas de corte, contadores, ventilação, detectores.`,
  telecom: `Detecta elementos de telecomunicações: caminhos de cabos, ITED, tomadas RJ45, bastidores, ATI.`,
  topography: `Detecta elementos topográficos: curvas de nível, cotas, marcos, limites de propriedade, coordenadas, perfis.`,
  other: `Detecta todos os elementos técnicos visíveis na planta.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { projectId, analysisType = "full" } = await req.json();
    if (!projectId) throw new Error("projectId é obrigatório");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch project
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();
    if (projErr || !project) throw new Error("Projecto não encontrado");

    // Update status to analyzing
    await supabase
      .from("projects")
      .update({ analysis_status: "analyzing" })
      .eq("id", projectId);

    // Get signed URL for the file
    const filePath = project.file_url;
    let fileUrl = filePath;

    // If it's a storage path, generate signed URL
    if (filePath && !filePath.startsWith("http")) {
      const { data: signedData, error: signErr } = await supabase.storage
        .from("documents")
        .createSignedUrl(filePath, 3600);
      if (signErr) throw new Error("Erro ao gerar URL: " + signErr.message);
      fileUrl = signedData.signedUrl;
    }

    const specialtyPrompt = SPECIALTY_PROMPTS[project.specialty] || SPECIALTY_PROMPTS.other;
    const isQuick = analysisType === "quick";

    const systemPrompt = `És um especialista em análise de plantas técnicas de construção civil.
Analisa a planta fornecida com rigor técnico.

ESPECIALIDADE: ${project.specialty}
${specialtyPrompt}

${isQuick ? "Faz uma análise rápida, identificando apenas os elementos principais (máx. 15)." : "Faz uma análise completa e detalhada de todos os elementos visíveis."}

PARA CADA ELEMENTO detectado, indica:
- tipo: categoria do elemento
- codigo: código visível na planta (ex: P1, V2, QE1) ou null
- localizacao: descrição da posição na planta
- propriedades: dimensões, materiais ou outras propriedades visíveis
- confianca: nível de confiança da detecção (0.0 a 1.0)

Inclui também metadados da planta (escala, título, notas) e observações gerais.`;

    const userContent: any[] = [
      { type: "text", text: `Analisa esta planta técnica de ${project.specialty}. Nome: ${project.name}` },
    ];

    if (fileUrl) {
      const isPdf = project.file_type?.includes("pdf");
      userContent.push({
        type: "image_url",
        image_url: { url: fileUrl, detail: isPdf ? "high" : "auto" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analysis_result",
              description: "Resultado estruturado da análise da planta técnica",
              parameters: {
                type: "object",
                properties: {
                  metadata: {
                    type: "object",
                    properties: {
                      escala: { type: "string" },
                      titulo: { type: "string" },
                      notas: { type: "string" },
                    },
                  },
                  elementos: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        tipo: { type: "string" },
                        codigo: { type: "string" },
                        localizacao: { type: "string" },
                        propriedades: { type: "object" },
                        confianca: { type: "number" },
                      },
                      required: ["tipo", "localizacao", "confianca"],
                    },
                  },
                  observacoes: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["metadata", "elementos", "observacoes"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analysis_result" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      await supabase.from("projects").update({ analysis_status: "failed" }).eq("id", projectId);
      return new Response(JSON.stringify({ error: "Erro na análise IA", status: aiResponse.status }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      await supabase.from("projects").update({ analysis_status: "failed" }).eq("id", projectId);
      return new Response(JSON.stringify({ error: "Sem resultado estruturado da IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = JSON.parse(toolCall.function.arguments);
    const { elementos, metadata, observacoes } = result;

    // Delete old elements
    await supabase.from("project_elements").delete().eq("project_id", projectId);

    // Insert new elements
    if (elementos && elementos.length > 0) {
      const rows = elementos.map((el: any) => ({
        project_id: projectId,
        element_type: el.tipo,
        element_code: el.codigo || null,
        location_description: el.localizacao || null,
        properties: { ...el.propriedades, metadata_escala: metadata?.escala, metadata_titulo: metadata?.titulo },
        confidence: el.confianca || null,
      }));

      const { error: insertErr } = await supabase.from("project_elements").insert(rows);
      if (insertErr) console.error("Insert elements error:", insertErr);
    }

    // Update project status
    await supabase
      .from("projects")
      .update({
        analysis_status: "completed",
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    return new Response(
      JSON.stringify({
        success: true,
        elements_count: elementos?.length || 0,
        metadata,
        observacoes,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ai-analyze-project error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
