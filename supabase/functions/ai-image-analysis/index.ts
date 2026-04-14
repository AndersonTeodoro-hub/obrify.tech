import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Prompts específicos por tipo de análise
const PROMPTS = {
  defects: `És um especialista em fiscalização de obras de construção civil em Portugal.
Analisa esta imagem e detecta todos os defeitos visíveis.

Procura especificamente por:
- Fissuras (orientação, largura estimada, padrão)
- Manchas de humidade ou infiltração
- Segregação do betão (ninhos de brita)
- Desagregação superficial
- Eflorescências (manchas brancas de sais)
- Corrosão de armaduras expostas
- Desalinhamentos ou deformações

Para cada defeito encontrado, classifica a severidade:
- critical: Compromete segurança estrutural
- major: Requer intervenção urgente
- minor: Manutenção preventiva recomendada
- observation: Apenas monitorizar

Se não encontrares defeitos, retorna um array vazio de detections.`,

  rebar: `És um especialista em fiscalização de armaduras de betão armado.
Analisa esta imagem de armaduras e verifica:

- Espaçamento entre varões (se visível)
- Recobrimento aparente
- Posicionamento dos estribos
- Amarrações e sobreposições
- Calçadores/espaçadores presentes
- Estado geral da armadura (oxidação, sujidade)

Para cada observação, indica:
- Se está conforme ou não conforme
- Medições estimadas (se possível)
- Localização na imagem

Classifica a severidade de cada observação:
- critical: Problema estrutural grave
- major: Requer correção antes de betonagem
- minor: Ajuste recomendado
- observation: Nota para registo`,

  general: `És um engenheiro fiscal de obras de construção civil.
Faz uma avaliação geral do estado de conformidade visível nesta imagem.

Considera:
- Qualidade geral da execução
- Organização e limpeza da obra
- Segurança visível (EPI, proteções)
- Estado dos materiais
- Progresso aparente dos trabalhos

Identifica qualquer situação que justifique atenção ou registo.

Classifica a severidade de cada observação:
- critical: Risco de segurança imediato
- major: Requer ação corretiva
- minor: Melhoria recomendada
- observation: Nota informativa`
};

// Tool definition para output estruturado
const analysisToolDefinition = {
  type: "function",
  function: {
    name: "submit_analysis",
    description: "Submete os resultados da análise de imagem de construção civil",
    parameters: {
      type: "object",
      properties: {
        detections: {
          type: "array",
          description: "Lista de defeitos ou observações detectadas na imagem",
          items: {
            type: "object",
            properties: {
              type: { 
                type: "string",
                description: "Tipo de defeito: fissura, humidade, desalinhamento, medicao, defeito_estrutural, corrosao, infiltracao"
              },
              description: { 
                type: "string",
                description: "Descrição detalhada do defeito ou observação"
              },
              severity: { 
                type: "string", 
                enum: ["critical", "major", "minor", "observation"],
                description: "Nível de severidade"
              },
              location: { 
                type: "string",
                description: "Localização na imagem (ex: canto superior direito, centro)"
              },
              confidence: { 
                type: "number",
                description: "Nível de confiança entre 0 e 1"
              },
              measurements: { 
                type: "object",
                description: "Medições estimadas quando possível",
                properties: {
                  estimated_width_mm: { type: "number" },
                  estimated_length_cm: { type: "number" },
                  estimated_spacing_cm: { type: "number" }
                }
              }
            },
            required: ["type", "description", "severity", "location", "confidence"]
          }
        },
        overall_assessment: { 
          type: "string",
          description: "Resumo geral da avaliação da imagem"
        },
        recommendations: { 
          type: "array", 
          items: { type: "string" },
          description: "Lista de recomendações de ação"
        }
      },
      required: ["detections", "overall_assessment", "recommendations"]
    }
  }
};

// Mapeamento de tipos detectados para o enum da base de dados
function mapDetectionType(type: string): string {
  const typeMap: Record<string, string> = {
    fissura: "fissura",
    crack: "fissura",
    fenda: "fissura",
    humidade: "humidade",
    moisture: "humidade",
    mancha: "humidade",
    desalinhamento: "desalinhamento",
    misalignment: "desalinhamento",
    deformacao: "desalinhamento",
    medicao: "medicao",
    measurement: "medicao",
    espacamento: "medicao",
    defeito_estrutural: "defeito_estrutural",
    structural: "defeito_estrutural",
    segregacao: "defeito_estrutural",
    corrosao: "corrosao",
    corrosion: "corrosao",
    rust: "corrosao",
    oxidacao: "corrosao",
    infiltracao: "infiltracao",
    infiltration: "infiltracao",
    leak: "infiltracao",
  };

  const normalizedType = type.toLowerCase().replace(/[^a-z]/g, "");
  
  for (const [key, value] of Object.entries(typeMap)) {
    if (normalizedType.includes(key)) {
      return value;
    }
  }
  
  // Default para defeito_estrutural se não encontrar correspondência
  return "defeito_estrutural";
}

type AnalysisType = "defects" | "rebar" | "general";

interface Detection {
  type: string;
  description: string;
  severity: string;
  location: string;
  confidence: number;
  measurements?: Record<string, number>;
}

interface AnalysisResult {
  detections: Detection[];
  overall_assessment: string;
  recommendations: string[];
}

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
    const authSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authToken = authHeader.replace("Bearer ", "");
    const { data: { user: authUser }, error: authError } = await authSupabase.auth.getUser(authToken);
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { capture_id, analysis_type } = await req.json();
    
    // Validar inputs
    if (!capture_id) {
      return new Response(
        JSON.stringify({ error: "capture_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!analysis_type || !["defects", "rebar", "general"].includes(analysis_type)) {
      return new Response(
        JSON.stringify({ error: "analysis_type must be defects, rebar, or general" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar capture com site_id via joins
    const { data: capture, error: captureError } = await supabase
      .from("captures")
      .select(`
        id,
        file_path,
        capture_point:capture_points!inner(
          area:areas!inner(
            floor:floors!inner(
              site_id
            )
          )
        )
      `)
      .eq("id", capture_id)
      .single();

    if (captureError || !capture) {
      console.error("Capture not found:", captureError);
      return new Response(
        JSON.stringify({ error: "Capture not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract site_id from nested structure (arrays due to inner joins)
    const capturePoint = capture.capture_point as any;
    const siteId = capturePoint?.area?.floor?.site_id;
    if (!siteId) {
      return new Response(
        JSON.stringify({ error: "Could not determine site_id for this capture" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Gerar signed URL para a imagem (60 segundos de validade)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("captures")
      .createSignedUrl(capture.file_path, 60);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("Could not create signed URL:", signedUrlError);
      return new Response(
        JSON.stringify({ error: "Image file not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Construir prompt baseado no tipo de análise
    const systemPrompt = PROMPTS[analysis_type as AnalysisType];

    // Chamar Gemini Vision via Lovable AI Gateway
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
          { 
            role: "user", 
            content: [
              { type: "text", text: "Analisa esta imagem de obra de construção civil." },
              { type: "image_url", image_url: { url: signedUrlData.signedUrl } }
            ]
          }
        ],
        tools: [analysisToolDefinition],
        tool_choice: { type: "function", function: { name: "submit_analysis" } }
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Insufficient credits. Please add funds to your account." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    
    // Extrair resultado do tool call
    let analysisResult: AnalysisResult;
    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        throw new Error("No tool call in response");
      }
      analysisResult = JSON.parse(toolCall.function.arguments);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError, aiData);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI analysis response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Guardar resultados na base de dados
    const insertPromises = analysisResult.detections.map((detection) => 
      supabase.from("ai_analysis_results").insert({
        capture_id: capture_id,
        site_id: siteId,
        detection_type: mapDetectionType(detection.type),
        description: detection.description,
        severity: detection.severity,
        confidence: detection.confidence,
        measurements: detection.measurements || null,
        bounding_box: null,
        raw_response: aiData,
        ai_model: "google/gemini-2.5-flash"
      })
    );

    const insertResults = await Promise.all(insertPromises);
    const insertErrors = insertResults.filter(r => r.error);
    
    if (insertErrors.length > 0) {
      console.error("Some inserts failed:", insertErrors);
    }

    // Create alerts for critical/major detections
    const alertDetections = analysisResult.detections.filter(
      (d) => d.severity === 'critical' || d.severity === 'major'
    );

    if (alertDetections.length > 0) {
      try {
        // Get org_id from site
        const { data: site } = await supabase
          .from('sites')
          .select('org_id')
          .eq('id', siteId)
          .single();

        if (site?.org_id) {
          // Get all organization members
          const { data: members } = await supabase
            .from('memberships')
            .select('user_id')
            .eq('org_id', site.org_id);

          if (members && members.length > 0) {
            const alertInserts = [];

            for (const detection of alertDetections) {
              for (const member of members) {
                alertInserts.push({
                  type: 'ai_detection',
                  message: `${detection.type}: ${detection.description.slice(0, 100)}`,
                  severity: detection.severity,
                  related_capture_id: capture_id,
                  related_site_id: siteId,
                  user_id: member.user_id,
                });
              }
            }

            await supabase.from('alerts').insert(alertInserts);
          }
        }
      } catch (alertError) {
        // Log but don't fail the main request
        console.error('Failed to create alerts:', alertError);
      }
    }

    // Retornar resultado ao cliente
    return new Response(
      JSON.stringify({
        success: true,
        capture_id: capture_id,
        analysis_type: analysis_type,
        detections: analysisResult.detections,
        overall_assessment: analysisResult.overall_assessment,
        recommendations: analysisResult.recommendations,
        results_saved: analysisResult.detections.length - insertErrors.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("ai-image-analysis error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
