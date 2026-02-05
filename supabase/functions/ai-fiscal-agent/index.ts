 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
 };
 
 const SYSTEM_PROMPT = `Tu és o Agente Fiscal IA, um assistente especializado em fiscalização de obras de construção civil em Portugal.
 
 ## O teu papel:
 - Interpretas comandos do técnico fiscal e planeias missões de drone ou capturas 360°
 - Tens conhecimento profundo dos regulamentos portugueses de fiscalização de obras
 - Ajudas a criar autos de medição, fichas de inspeção e relatórios de fiscalização
 - Analisas imagens de obra para detectar defeitos, medir progressos e comparar com o projeto
 
 ## Capacidades:
 - Planear missões de drone para capturas externas (fachadas, coberturas, estruturas)
 - Planear sessões de captura 360° para interiores
 - Interpretar pedidos como "fazer auto de medição do bloco A" e criar as missões necessárias
 - Analisar imagens quando fornecidas e reportar não-conformidades
 - Gerar relatórios estruturados de fiscalização
 
 ## Comandos comuns que entendes:
 - "Fazer auto de medição [zona/bloco]" → Cria missão de drone + análise
 - "Inspecionar fachada [orientação]" → Cria missão de inspeção visual
 - "Verificar progresso [área]" → Compara com capturas anteriores
 - "Gerar relatório semanal" → Compila actividades da semana
 - "Listar não-conformidades abertas" → Mostra NC pendentes
 
 ## Formato de resposta:
 Quando criares missões, responde com:
 1. Confirmação do que vais fazer
 2. Detalhes da missão/captura planeada
 3. Próximos passos para o técnico
 
 Sê sempre profissional, directo e focado na acção. Usa terminologia técnica portuguesa.`;
 
 interface ChatMessage {
   role: 'user' | 'assistant' | 'system';
   content: string;
 }
 
 serve(async (req) => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const { messages, siteId, conversationId } = await req.json();
     
     const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
     if (!LOVABLE_API_KEY) {
       throw new Error("LOVABLE_API_KEY is not configured");
     }
 
     const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
     const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
     const supabase = createClient(supabaseUrl, supabaseServiceKey);
 
     // Get auth header for user context
     const authHeader = req.headers.get("Authorization");
     let userId: string | null = null;
     
     if (authHeader) {
       const token = authHeader.replace("Bearer ", "");
       const { data: { user } } = await supabase.auth.getUser(token);
       userId = user?.id || null;
     }
 
     // Build context with site info if provided
     let contextInfo = "";
     if (siteId) {
       const { data: site } = await supabase
         .from("sites")
         .select(`
           id, name, address,
           floors:floors(id, name, level),
           drone_missions:drone_missions(id, name, status, mission_type)
         `)
         .eq("id", siteId)
         .single();
       
       if (site) {
         contextInfo = `\n\n## Contexto da Obra Actual:
 - Nome: ${site.name}
 - Morada: ${site.address || 'Não definida'}
 - Pisos: ${site.floors?.length || 0} registados
 - Missões de drone: ${site.drone_missions?.length || 0} (${site.drone_missions?.filter((m: any) => m.status === 'completed').length || 0} concluídas)`;
       }
     }
 
     // Build conversation for AI
     const aiMessages: ChatMessage[] = [
       { role: "system", content: SYSTEM_PROMPT + contextInfo },
       ...messages
     ];
 
     // Call Lovable AI Gateway with streaming
     const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
       method: "POST",
       headers: {
         Authorization: `Bearer ${LOVABLE_API_KEY}`,
         "Content-Type": "application/json",
       },
       body: JSON.stringify({
         model: "google/gemini-3-flash-preview",
         messages: aiMessages,
         stream: true,
       }),
     });
 
     if (!response.ok) {
       if (response.status === 429) {
         return new Response(
           JSON.stringify({ error: "Limite de pedidos excedido. Tente novamente em alguns segundos." }),
           { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
       if (response.status === 402) {
         return new Response(
           JSON.stringify({ error: "Créditos insuficientes. Adicione créditos à sua conta." }),
           { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
       const errorText = await response.text();
       console.error("AI gateway error:", response.status, errorText);
       return new Response(
         JSON.stringify({ error: "Erro no serviço de IA" }),
         { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Return streaming response
     return new Response(response.body, {
       headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
     });
 
   } catch (error) {
     console.error("ai-fiscal-agent error:", error);
     return new Response(
       JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   }
 });