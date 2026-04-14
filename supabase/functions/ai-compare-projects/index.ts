import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const SPECIALTY_LABELS: Record<string, string> = {
  topography: "Topografia",
  architecture: "Arquitectura",
  structure: "Estruturas",
  plumbing: "Águas e Esgotos",
  electrical: "Electricidade",
  hvac: "AVAC",
  gas: "Gás",
  telecom: "Telecomunicações",
  other: "Outros",
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { project1Id, project2Id } = await req.json();
    if (!project1Id || typeof project1Id !== "string" || !project2Id || typeof project2Id !== "string") {
      throw new Error("project1Id e project2Id são obrigatórios");
    }
    if (project1Id === project2Id) {
      throw new Error("project1Id e project2Id não podem ser iguais");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch both projects
    const [{ data: p1 }, { data: p2 }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", project1Id).single(),
      supabase.from("projects").select("*").eq("id", project2Id).single(),
    ]);
    if (!p1 || !p2) throw new Error("Um ou ambos os projectos não encontrados");

    const MAX_FILE_SIZE = 15 * 1024 * 1024;
    if ((p1.file_size && p1.file_size > MAX_FILE_SIZE) || (p2.file_size && p2.file_size > MAX_FILE_SIZE)) {
      throw new Error("Um ou ambos os ficheiros excedem 15MB.");
    }

    // Build image URLs
    const getUrl = async (project: any) => {
      if (!project.file_url) return null;
      if (project.file_url.startsWith("http")) return project.file_url;
      const { data } = await supabase.storage.from("documents").createSignedUrl(project.file_url, 3600);
      return data?.signedUrl || null;
    };

    const [url1, url2] = await Promise.all([getUrl(p1), getUrl(p2)]);

    const esp1 = SPECIALTY_LABELS[p1.specialty] || p1.specialty;
    const esp2 = SPECIALTY_LABELS[p2.specialty] || p2.specialty;

    const systemPrompt = `És um especialista em coordenação de projectos de construção civil.
Compara as duas plantas técnicas fornecidas e identifica incompatibilidades.

PLANTA 1: ${esp1} - "${p1.name}"
PLANTA 2: ${esp2} - "${p2.name}"

TIPOS DE CONFLITOS A DETECTAR:
- spatial_overlap: elementos de diferentes especialidades a ocupar o mesmo espaço físico
- dimension_mismatch: cotas ou dimensões diferentes entre plantas para o mesmo elemento
- missing_provision: atravessamentos ou reservas não previstos
- code_violation: violações de normas ou regulamentos técnicos

Para cada conflito indica severidade: critical (risco estrutural/segurança), high (impacto funcional), medium (correcção necessária), low (optimização).

Avalia também a compatibilidade geral e lista verificações positivas.`;

    const userContent: any[] = [
      { type: "text", text: `Compara estas duas plantas técnicas:\n1. ${esp1}: ${p1.name}\n2. ${esp2}: ${p2.name}` },
    ];

    if (url1) userContent.push({ type: "image_url", image_url: { url: url1, detail: "high" } });
    if (url2) userContent.push({ type: "image_url", image_url: { url: url2, detail: "high" } });

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
              name: "comparison_result",
              description: "Resultado estruturado da comparação entre plantas",
              parameters: {
                type: "object",
                properties: {
                  compatibilidade: { type: "string", enum: ["boa", "moderada", "problematica"] },
                  resumo: { type: "string" },
                  conflitos: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        tipo: { type: "string", enum: ["spatial_overlap", "dimension_mismatch", "missing_provision", "code_violation"] },
                        severidade: { type: "string", enum: ["critical", "high", "medium", "low"] },
                        titulo: { type: "string" },
                        descricao: { type: "string" },
                        localizacao: { type: "string" },
                        confianca: { type: "number" },
                      },
                      required: ["tipo", "severidade", "titulo", "descricao", "confianca"],
                    },
                  },
                  verificacoes_ok: { type: "array", items: { type: "string" } },
                },
                required: ["compatibilidade", "resumo", "conflitos", "verificacoes_ok"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "comparison_result" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI compare error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "Erro na comparação IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "Sem resultado estruturado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = JSON.parse(toolCall.function.arguments);
    const { conflitos, compatibilidade, resumo, verificacoes_ok } = result;

    // Insert conflicts
    if (conflitos && conflitos.length > 0) {
      const rows = conflitos.map((c: any) => ({
        organization_id: p1.organization_id,
        site_id: p1.site_id,
        project1_id: project1Id,
        project2_id: project2Id,
        conflict_type: c.tipo,
        severity: c.severidade,
        title: c.titulo,
        description: c.descricao,
        location_description: c.localizacao || null,
        ai_confidence: c.confianca || null,
        status: "detected",
      }));

      const { error: insertErr } = await supabase.from("project_conflicts").insert(rows);
      if (insertErr) console.error("Insert conflicts error:", insertErr);
    }

    // Create alerts for critical conflicts
    const criticals = (conflitos || []).filter((c: any) => c.severidade === "critical");
    if (criticals.length > 0) {
      // Get org members
      const { data: members } = await supabase
        .from("memberships")
        .select("user_id")
        .eq("org_id", p1.organization_id);

      if (members && members.length > 0) {
        const alerts = members.map((m: any) => ({
          user_id: m.user_id,
          type: "project_conflict",
          severity: "critical",
          message: `${criticals.length} conflito(s) crítico(s) detectado(s) entre ${esp1} e ${esp2}`,
          related_site_id: p1.site_id,
        }));
        await supabase.from("alerts").insert(alerts);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        compatibilidade,
        resumo,
        conflicts_count: conflitos?.length || 0,
        verificacoes_ok,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ai-compare-projects error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
