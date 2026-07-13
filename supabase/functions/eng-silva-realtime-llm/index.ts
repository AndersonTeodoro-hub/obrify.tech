import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

// Mesmo modelo já usado nas outras functions do projeto.
const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const MAX_TOKENS = 800;

// Persona MÍNIMA do spike (deliberadamente sem retrieval/fases/contexto).
const SPIKE_PERSONA =
  "És o Eng. Silva, engenheiro civil sénior português. Conversa natural, respostas " +
  "de 1-3 frases, português europeu, tom directo e cordial. Este é um teste técnico " +
  "de voz — responde a qualquer pergunta de forma breve e natural.";

// Mapeia messages OpenAI -> { system extra, messages Anthropic }.
// O system da OpenAI (se vier) é concatenado ao nosso; user/assistant passam direto.
function mapMessages(openaiMessages: any[]): { system: string; messages: { role: string; content: string }[] } {
  let systemExtra = "";
  const messages: { role: string; content: string }[] = [];
  for (const m of (Array.isArray(openaiMessages) ? openaiMessages : [])) {
    const role = m?.role;
    const content = typeof m?.content === "string"
      ? m.content
      : Array.isArray(m?.content)
        ? m.content.map((p: any) => (typeof p === "string" ? p : p?.text || "")).join("")
        : "";
    if (role === "system") {
      systemExtra += (systemExtra ? "\n\n" : "") + content;
    } else if (role === "user" || role === "assistant") {
      messages.push({ role, content });
    }
    // outros roles (tool, etc.) — ignorados neste spike
  }
  return { system: systemExtra, messages };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const encoder = new TextEncoder();
  const sse = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  // --- Auth por header secreto (o chamador é a ElevenLabs, não um utilizador Supabase) ---
  const spikeKey = Deno.env.get("SPIKE_LLM_KEY");
  const provided = req.headers.get("x-spike-key");
  if (!spikeKey || !provided || provided !== spikeKey) {
    console.error("REALTIME-LLM: 401 — x-spike-key ausente ou inválida");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    console.error("REALTIME-LLM: ANTHROPIC_API_KEY em falta");
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    console.error("REALTIME-LLM: body inválido:", e);
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { system: systemExtra, messages } = mapMessages(body?.messages);
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages must contain at least one user/assistant turn" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const systemPrompt = systemExtra ? `${SPIKE_PERSONA}\n\n${systemExtra}` : SPIKE_PERSONA;

  // --- Chamada Anthropic em streaming ---
  let upstream: Response;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages,
        stream: true,
      }),
    });
  } catch (e) {
    console.error("REALTIME-LLM: fetch à Anthropic falhou:", e);
    return new Response(JSON.stringify({ error: "Upstream fetch failed" }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const id = `chatcmpl-spike-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const chunk = (delta: Record<string, unknown>, finish: string | null) =>
    sse({ id, object: "chat.completion.chunk", created, model: CLAUDE_MODEL,
          choices: [{ index: 0, delta, finish_reason: finish }] });
  const DONE = encoder.encode("data: [DONE]\n\n");

  // Falha da API Anthropic ANTES do stream: retransmitir como erro SSE legível (200,
  // para o custom LLM não rebentar) + console.error com contexto.
  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "(sem corpo)");
    console.error(`REALTIME-LLM: Anthropic ${upstream.status}:`, errText.slice(0, 800));
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk({ role: "assistant", content: `[erro do modelo: Anthropic ${upstream.status}]` }, null));
        controller.enqueue(chunk({}, "stop"));
        controller.enqueue(DONE);
        controller.close();
      },
    });
    return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  }

  // --- Traduz o SSE nativo da Anthropic -> chunks OpenAI, à medida que chegam ---
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      let done = false;
      const finish = (reason: string) => {
        if (done) return;
        controller.enqueue(chunk({}, reason));
        controller.enqueue(DONE);
        done = true;
      };
      // Primeiro chunk com role (compat OpenAI).
      controller.enqueue(chunk({ role: "assistant" }, null));
      try {
        while (true) {
          const { done: rDone, value } = await reader.read();
          if (rDone) break;
          buffer += decoder.decode(value, { stream: true });
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const jsonStr = dataLine.slice(5).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;
            let evt: any;
            try {
              evt = JSON.parse(jsonStr);
            } catch {
              console.warn("REALTIME-LLM: frame SSE não-JSON ignorado:", jsonStr.slice(0, 120));
              continue;
            }
            if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
              const text = evt.delta.text || "";
              if (text) controller.enqueue(chunk({ content: text }, null));
            } else if (evt.type === "message_delta") {
              if (evt.delta?.stop_reason === "max_tokens") {
                console.warn(`REALTIME-LLM: resposta truncada (max_tokens=${MAX_TOKENS})`);
              }
            } else if (evt.type === "error") {
              console.error("REALTIME-LLM: erro SSE Anthropic:", JSON.stringify(evt).slice(0, 500));
              controller.enqueue(chunk({ content: "[erro do modelo durante a geração]" }, null));
            }
          }
        }
        finish("stop");
      } catch (e) {
        console.error("REALTIME-LLM: erro a ler o stream Anthropic:", e);
        controller.enqueue(chunk({ content: "[erro de ligação ao modelo]" }, null));
        finish("stop");
      } finally {
        controller.close();
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
});
