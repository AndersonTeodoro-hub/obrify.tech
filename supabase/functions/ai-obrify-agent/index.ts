import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `És o Obrify, um agente inteligente de fiscalização de obras.

CAPACIDADES:
- Consultar: obras, capturas, inspecções, não-conformidades
- Executar: navegar para páginas, filtrar dados
- Analisar: comparar dados, calcular estatísticas

COMPORTAMENTO:
- Responde em português (ou idioma do utilizador)
- Quando executas acção, descreve o que fizeste
- Sê conciso mas informativo
- Usa dados reais, nunca inventes
- Quando não tens dados, diz claramente`;

interface ToolAction {
  tool: string;
  params: Record<string, unknown>;
}

async function executeAction(
  supabase: ReturnType<typeof createClient>,
  action: ToolAction
): Promise<unknown> {
  try {
    switch (action.tool) {
      case "QUERY_SITES": {
        const p = action.params as { filter?: string; status?: string; limit?: number };
        let q = supabase.from("sites").select("id, name, address, status, created_at, org_id");
        if (p.status) q = q.eq("status", p.status);
        if (p.filter) q = q.ilike("name", `%${p.filter}%`);
        q = q.limit(p.limit || 20);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return data;
      }
      case "QUERY_CAPTURES": {
        const p = action.params as { siteId?: string; dateFrom?: string; limit?: number };
        let q = supabase
          .from("captures")
          .select("id, file_path, captured_at, source_type, processing_status, capture_point_id");
        if (p.dateFrom) q = q.gte("captured_at", p.dateFrom);
        q = q.order("captured_at", { ascending: false }).limit(p.limit || 20);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return data;
      }
      case "QUERY_NONCONFORMITIES": {
        const p = action.params as { siteId?: string; severity?: string; status?: string; limit?: number };
        let q = supabase
          .from("nonconformities")
          .select("id, title, severity, status, due_date, created_at, site_id, description");
        if (p.siteId) q = q.eq("site_id", p.siteId);
        if (p.severity) q = q.eq("severity", p.severity);
        if (p.status) q = q.eq("status", p.status);
        q = q.order("created_at", { ascending: false }).limit(p.limit || 20);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return data;
      }
      case "QUERY_STATS": {
        const p = action.params as { siteId?: string };
        const results: Record<string, unknown> = {};

        // Sites count
        const { count: sitesCount } = await supabase
          .from("sites")
          .select("*", { count: "exact", head: true });
        results.total_sites = sitesCount || 0;

        // NCs by status
        let ncQuery = supabase
          .from("nonconformities")
          .select("status");
        if (p.siteId) ncQuery = ncQuery.eq("site_id", p.siteId);
        const { data: ncs } = await ncQuery;
        if (ncs) {
          const statusCounts: Record<string, number> = {};
          ncs.forEach((nc: { status: string }) => {
            statusCounts[nc.status] = (statusCounts[nc.status] || 0) + 1;
          });
          results.nonconformities = { total: ncs.length, by_status: statusCounts };
        }

        // Inspections count
        let inspQuery = supabase
          .from("inspections")
          .select("*", { count: "exact", head: true });
        if (p.siteId) inspQuery = inspQuery.eq("site_id", p.siteId);
        const { count: inspCount } = await inspQuery;
        results.total_inspections = inspCount || 0;

        // Captures count
        const { count: captCount } = await supabase
          .from("captures")
          .select("*", { count: "exact", head: true });
        results.total_captures = captCount || 0;

        return results;
      }
      case "NAVIGATE": {
        const p = action.params as { path: string };
        return { navigateTo: p.path };
      }
      case "GENERATE_REPORT": {
        return {
          message:
            "Para gerar o relatório, navega até à página de Relatórios e selecciona o tipo desejado.",
          navigateTo: "/app/reports",
        };
      }
      default:
        return { error: `Tool desconhecida: ${action.tool}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const contextInfo = context
      ? `\nCONTEXTO ACTUAL: Página: ${context.page || "desconhecida"}${context.siteId ? `, Obra ID: ${context.siteId}` : ""}`
      : "";

    // Step 1: Ask AI what to do
    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT + contextInfo },
            { role: "user", content: message },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "obrify_response",
                description:
                  "Responde ao utilizador com acções e texto. Usa as tools disponíveis para consultar dados reais.",
                parameters: {
                  type: "object",
                  properties: {
                    thought: {
                      type: "string",
                      description: "Raciocínio interno sobre o que vais fazer",
                    },
                    actions: {
                      type: "array",
                      description: "Acções a executar",
                      items: {
                        type: "object",
                        properties: {
                          tool: {
                            type: "string",
                            enum: [
                              "QUERY_SITES",
                              "QUERY_CAPTURES",
                              "QUERY_NONCONFORMITIES",
                              "QUERY_STATS",
                              "NAVIGATE",
                              "GENERATE_REPORT",
                            ],
                          },
                          params: { type: "object" },
                        },
                        required: ["tool", "params"],
                      },
                    },
                    response: {
                      type: "string",
                      description: "Resposta ao utilizador em linguagem natural",
                    },
                    suggestions: {
                      type: "array",
                      items: { type: "string" },
                      description: "2-3 sugestões de follow-up",
                    },
                  },
                  required: ["thought", "actions", "response", "suggestions"],
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "obrify_response" },
          },
        }),
      }
    );

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Demasiados pedidos. Tenta novamente em breve." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos esgotados. Contacta o administrador." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      throw new Error("Erro no gateway AI");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      // Fallback: use content directly
      const content = aiData.choices?.[0]?.message?.content || "Desculpa, não consegui processar o pedido.";
      return new Response(
        JSON.stringify({ thought: "", actions: [], response: content, suggestions: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const { thought, actions, suggestions } = parsed;
    let { response: textResponse } = parsed;

    // Step 2: Execute actions and collect results
    const actionResults: unknown[] = [];
    if (actions && actions.length > 0) {
      for (const action of actions) {
        const result = await executeAction(supabase, action);
        actionResults.push({ tool: action.tool, result });
      }

      // Step 3: Send results back to AI for final formatting
      const formatResponse = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: SYSTEM_PROMPT + contextInfo },
              { role: "user", content: message },
              {
                role: "assistant",
                content: `Pensei: ${thought}. Executei as acções e obtive estes resultados: ${JSON.stringify(actionResults)}`,
              },
              {
                role: "user",
                content:
                  "Com base nos resultados acima, formula uma resposta clara e concisa em português para o utilizador. Responde apenas com o texto da resposta, sem JSON.",
              },
            ],
          }),
        }
      );

      if (formatResponse.ok) {
        const formatData = await formatResponse.json();
        const formatted = formatData.choices?.[0]?.message?.content;
        if (formatted) textResponse = formatted;
      }
    }

    // Build final response with navigation actions
    const finalActions = actionResults.filter(
      (r: any) => r.result?.navigateTo
    );

    return new Response(
      JSON.stringify({
        thought,
        actions: finalActions,
        response: textResponse,
        suggestions: suggestions || [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("obrify-agent error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Erro desconhecido",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
