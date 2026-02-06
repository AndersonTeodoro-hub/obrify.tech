import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `És o Obrify, um agente inteligente de fiscalização de obras.

CAPACIDADES:
- Consultar: obras, capturas, inspecções, não-conformidades, ficheiros
- Executar: navegar para páginas, filtrar dados, organizar ficheiros
- Analisar: comparar dados, calcular estatísticas

COMPORTAMENTO:
- Responde em português (ou idioma do utilizador)
- Quando executas acção, descreve o que fizeste
- Sê conciso mas informativo
- Usa dados reais, nunca inventes
- Quando não tens dados, diz claramente`;

const EXPERT_PROMPT = `
MODO ESPECIALISTA - Eng. Silva:
És o Engenheiro Silva, especialista sénior com 35 anos de experiência em betão armado e fiscalização de obras.
Conhecimento profundo de: Eurocódigos (EC2, EC7, EC8), EN 206, REBAP, REBA.
Responde de forma técnica e precisa, citando normas quando relevante.
Foca em: patologias do betão, conformidade normativa, boas práticas de fiscalização.
Usa linguagem técnica mas acessível. Quando apropriado, alerta para riscos de segurança.
Assina as tuas respostas como "Eng. Silva".`;

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
        const { count: sitesCount } = await supabase
          .from("sites").select("*", { count: "exact", head: true });
        results.total_sites = sitesCount || 0;
        let ncQuery = supabase.from("nonconformities").select("status");
        if (p.siteId) ncQuery = ncQuery.eq("site_id", p.siteId);
        const { data: ncs } = await ncQuery;
        if (ncs) {
          const statusCounts: Record<string, number> = {};
          ncs.forEach((nc: { status: string }) => {
            statusCounts[nc.status] = (statusCounts[nc.status] || 0) + 1;
          });
          results.nonconformities = { total: ncs.length, by_status: statusCounts };
        }
        let inspQuery = supabase.from("inspections").select("*", { count: "exact", head: true });
        if (p.siteId) inspQuery = inspQuery.eq("site_id", p.siteId);
        const { count: inspCount } = await inspQuery;
        results.total_inspections = inspCount || 0;
        const { count: captCount } = await supabase.from("captures").select("*", { count: "exact", head: true });
        results.total_captures = captCount || 0;
        return results;
      }
      case "NAVIGATE": {
        const p = action.params as { path: string };
        return { navigateTo: p.path };
      }
      case "GENERATE_REPORT": {
        return {
          message: "Para gerar o relatório, navega até à página de Relatórios e selecciona o tipo desejado.",
          navigateTo: "/app/reports",
        };
      }
      case "LIST_FILES": {
        const p = action.params as { siteId?: string; type?: string; folder?: string; limit?: number };
        let q = supabase.from("file_organization").select("*");
        if (p.siteId) q = q.eq("site_id", p.siteId);
        if (p.type) q = q.eq("file_type", p.type);
        if (p.folder) q = q.ilike("file_path", `%${p.folder}%`);
        q = q.order("created_at", { ascending: false }).limit(p.limit || 50);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return data;
      }
      case "SAVE_REPORT": {
        const p = action.params as { reportData?: unknown; type?: string; siteId?: string; orgId?: string; name?: string };
        if (!p.orgId || !p.siteId) return { error: "orgId e siteId são obrigatórios" };
        const { data: pathData } = await supabase.rpc("get_file_path", {
          _org_id: p.orgId, _site_id: p.siteId, _file_type: "report",
        });
        const filePath = (pathData || `organizations/${p.orgId}/sites/${p.siteId}/reports/`) + (p.name || `report_${Date.now()}.pdf`);
        const { data, error } = await supabase.from("file_organization").insert({
          organization_id: p.orgId,
          site_id: p.siteId,
          file_path: filePath,
          file_type: "report",
          original_name: p.name || "Relatório",
          generated_by: "agent",
          tags: [p.type || "general"],
        }).select().single();
        if (error) return { error: error.message };
        return { file: data, path: filePath };
      }
      case "ORGANIZE_FILES": {
        const p = action.params as { siteId?: string; type?: string; orgId?: string };
        let q = supabase.from("file_organization").select("id, file_path, file_type, original_name, tags, created_at");
        if (p.orgId) q = q.eq("organization_id", p.orgId);
        if (p.siteId) q = q.eq("site_id", p.siteId);
        if (p.type) q = q.eq("file_type", p.type);
        q = q.order("file_type").order("created_at", { ascending: false }).limit(100);
        const { data, error } = await q;
        if (error) return { error: error.message };
        const grouped: Record<string, unknown[]> = {};
        (data || []).forEach((f: any) => {
          if (!grouped[f.file_type]) grouped[f.file_type] = [];
          grouped[f.file_type].push(f);
        });
        return { files_by_type: grouped, total: (data || []).length };
      }
      case "QUERY_PROJECTS": {
        const p = action.params as { siteId?: string; specialty?: string; analyzed?: boolean; limit?: number };
        let q = supabase.from("projects").select("id, name, specialty, version, is_current_version, analysis_status, uploaded_at, floor_or_zone");
        if (p.siteId) q = q.eq("site_id", p.siteId);
        if (p.specialty) q = q.eq("specialty", p.specialty);
        if (p.analyzed === true) q = q.eq("analysis_status", "completed");
        if (p.analyzed === false) q = q.eq("analysis_status", "pending");
        q = q.order("uploaded_at", { ascending: false }).limit(p.limit || 20);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return data;
      }
      case "ANALYZE_PROJECT": {
        const p = action.params as { projectId: string };
        const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-analyze-project`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ projectId: p.projectId, analysisType: "full" }),
        });
        const result = await resp.json();
        if (!resp.ok) return { error: result.error || "Erro na análise" };
        return result;
      }
      case "COMPARE_PROJECTS": {
        const p = action.params as { project1Id: string; project2Id: string };
        const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-compare-projects`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ project1Id: p.project1Id, project2Id: p.project2Id }),
        });
        const result = await resp.json();
        if (!resp.ok) return { error: result.error || "Erro na comparação" };
        return result;
      }
      case "QUERY_CONFLICTS": {
        const p = action.params as { siteId?: string; severity?: string; status?: string; limit?: number };
        let q = supabase.from("project_conflicts").select("id, title, conflict_type, severity, status, description, location_description, ai_confidence, project1_id, project2_id, detected_at");
        if (p.siteId) q = q.eq("site_id", p.siteId);
        if (p.severity) q = q.eq("severity", p.severity);
        if (p.status) q = q.eq("status", p.status);
        q = q.order("detected_at", { ascending: false }).limit(p.limit || 20);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return data;
      }
      case "CREATE_NC_FROM_CONFLICT": {
        const p = action.params as { conflictId: string };
        const { data: conflict, error: cErr } = await supabase
          .from("project_conflicts").select("*").eq("id", p.conflictId).single();
        if (cErr || !conflict) return { error: "Conflito não encontrado" };
        // Mark conflict as nc_created
        await supabase.from("project_conflicts")
          .update({ status: "nc_created" })
          .eq("id", p.conflictId);
        return { success: true, conflictId: p.conflictId, status: "nc_created" };
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
    const { message, context, conversationId, userId, expertMode } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Persist user message if conversationId provided
    let userMessageId: string | null = null;
    if (conversationId && userId) {
      const { data: msgData } = await supabase.from("agent_messages").insert({
        conversation_id: conversationId,
        role: "user",
        content: message,
        context: context || {},
      }).select("id").single();
      userMessageId = msgData?.id || null;
    }

    const contextInfo = context
      ? `\nCONTEXTO ACTUAL: Página: ${context.page || "desconhecida"}${context.siteId ? `, Obra ID: ${context.siteId}` : ""}`
      : "";

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
            { role: "system", content: SYSTEM_PROMPT + (expertMode ? EXPERT_PROMPT : "") + contextInfo },
            { role: "user", content: message },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "obrify_response",
                description: "Responde ao utilizador com acções e texto.",
                parameters: {
                  type: "object",
                  properties: {
                    thought: { type: "string", description: "Raciocínio interno" },
                    actions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          tool: {
                            type: "string",
                            enum: [
                              "QUERY_SITES", "QUERY_CAPTURES", "QUERY_NONCONFORMITIES",
                              "QUERY_STATS", "NAVIGATE", "GENERATE_REPORT",
                              "LIST_FILES", "SAVE_REPORT", "ORGANIZE_FILES",
                              "QUERY_PROJECTS", "ANALYZE_PROJECT", "COMPARE_PROJECTS",
                              "QUERY_CONFLICTS", "CREATE_NC_FROM_CONFLICT",
                            ],
                          },
                          params: { type: "object" },
                        },
                        required: ["tool", "params"],
                      },
                    },
                    response: { type: "string", description: "Resposta em linguagem natural" },
                    suggestions: { type: "array", items: { type: "string" } },
                  },
                  required: ["thought", "actions", "response", "suggestions"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "obrify_response" } },
        }),
      }
    );

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Demasiados pedidos." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos esgotados." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      throw new Error("Erro no gateway AI");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      const content = aiData.choices?.[0]?.message?.content || "Desculpa, não consegui processar o pedido.";
      // Persist agent message
      if (conversationId) {
        await supabase.from("agent_messages").insert({
          conversation_id: conversationId, role: "agent", content, tools_used: [],
        });
      }
      return new Response(JSON.stringify({ thought: "", actions: [], response: content, suggestions: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const { thought, actions, suggestions } = parsed;
    let { response: textResponse } = parsed;

    const actionResults: unknown[] = [];
    if (actions && actions.length > 0) {
      for (const action of actions) {
        const result = await executeAction(supabase, action);
        actionResults.push({ tool: action.tool, result });

        // Log action
        if (conversationId) {
          await supabase.from("agent_actions_log").insert({
            conversation_id: conversationId,
            message_id: userMessageId,
            tool_name: action.tool,
            params: action.params || {},
            result: (typeof result === 'object' ? result : { value: result }) || {},
            success: !(result as any)?.error,
          });
        }
      }

      const formatResponse = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: SYSTEM_PROMPT + (expertMode ? EXPERT_PROMPT : "") + contextInfo },
              { role: "user", content: message },
              { role: "assistant", content: `Pensei: ${thought}. Resultados: ${JSON.stringify(actionResults)}` },
              { role: "user", content: "Com base nos resultados, formula uma resposta clara em português. Responde apenas com o texto." },
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

    // Persist agent message
    if (conversationId) {
      await supabase.from("agent_messages").insert({
        conversation_id: conversationId,
        role: "agent",
        content: textResponse,
        tools_used: actions || [],
      });
    }

    const finalActions = actionResults.filter((r: any) => r.result?.navigateTo);

    return new Response(
      JSON.stringify({ thought, actions: finalActions, response: textResponse, suggestions: suggestions || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("obrify-agent error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
