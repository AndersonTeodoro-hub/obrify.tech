import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, conversation_history, system, image } = await req.json();
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

    const messages = [...(conversation_history || [])];

    if (image) {
      // Multi-modal message with image + text
      messages.push({
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: image,
            },
          },
          {
            type: "text",
            text: message || "Analisa esta imagem e diz-me o que vês do ponto de vista de fiscalização de obra.",
          },
        ],
      });
    } else {
      messages.push({ role: "user", content: message });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1500,
        temperature: 0.3,
        system: system || "",
        messages,
      }),
    });

    const result = await response.json();
    const reply = result.content?.[0]?.text || "Desculpa, não consegui processar. Tenta novamente.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
