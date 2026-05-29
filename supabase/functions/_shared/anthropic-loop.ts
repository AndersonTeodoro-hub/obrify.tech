// Loop de continuação para server tools da Anthropic (ex.: web_search).
// Quando stop_reason="pause_turn", re-envia as messages com a resposta pausada
// anexada como assistant message, até stop_reason !== "pause_turn" ou ao cap de
// iterações. Padrão oficial Anthropic. Os resultados de server tools são preenchidos
// server-side; o caller NÃO executa tools.
//
// Salvaguardas (replicadas do loop inline original da PAM):
// - Fail-loud na 1ª iteração: se a chamada falhar antes de acumular qualquer
//   conteúdo, faz throw (o caller deixa propagar → erro visível, não mascarado).
// - Degradação graciosa nas continuações: falha com conteúdo já acumulado → break.

export interface ClaudeLoopOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
  system: string;
  messages: any[]; // sequência válida user/assistant
  tools?: any[];
  toolChoice?: any; // ex.: {type:"auto"}, {type:"tool", name:"web_search"}
  maxIterations?: number; // default 5
  logPrefix?: string; // default "[Claude loop]"
}

export interface ClaudeLoopResult {
  accumulatedText: string; // texto concatenado de todas as iterações
  totalServerToolCalls: number; // soma de web_search_requests
  finalStopReason: string;
  iterationsUsed: number;
  finalMessages: any[]; // messages + assistants acumulados (úteis para um 2º turno)
  hitIterationCap: boolean;
}

export async function runClaudeWithContinuation(
  options: ClaudeLoopOptions,
): Promise<ClaudeLoopResult> {
  const maxIterations = options.maxIterations ?? 5;
  const logPrefix = options.logPrefix ?? "[Claude loop]";

  // Cópia local para não mutar o array do caller.
  const messages: any[] = [...options.messages];
  let accumulatedText = "";
  let totalServerToolCalls = 0;
  let finalStopReason = "";
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    let result: any;
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": options.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: options.maxTokens,
          messages,
          system: options.system,
          ...(options.tools ? { tools: options.tools } : {}),
          ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error(`${logPrefix} iteração ${iteration} — Claude API error ${response.status}:`, errBody.substring(0, 300));
        if (iteration === 1 && !accumulatedText) {
          // Fail-loud: outage na 1ª chamada não pode ser mascarado
          throw new Error(`Claude API error: ${response.status} - ${errBody.substring(0, 300)}`);
        }
        break; // continuações: degradação graciosa, usa o acumulado
      }

      result = await response.json();
    } catch (loopErr) {
      console.error(`${logPrefix} iteração ${iteration} FALHOU na chamada API:`, loopErr);
      if (iteration === 1 && !accumulatedText) {
        // Fail-loud: outage na 1ª chamada não pode ser mascarado
        throw loopErr;
      }
      break; // continuações: degradação graciosa, usa o acumulado
    }

    // Acumular texto desta iteração (apenas blocos type==="text")
    const iterText = (result.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text || "")
      .join("\n");
    accumulatedText += (accumulatedText && iterText ? "\n" : "") + iterText;

    totalServerToolCalls += result.usage?.server_tool_use?.web_search_requests ?? 0;
    finalStopReason = result.stop_reason;

    console.log(`${logPrefix} iteração ${iteration}/${maxIterations}, stop_reason=${result.stop_reason}, web_searches_acumuladas=${totalServerToolCalls}`);

    // Se NÃO pausou, o turno terminou — saímos do loop.
    if (result.stop_reason !== "pause_turn") {
      break;
    }

    // Pausou (server tool a meio): anexar a resposta as-is e continuar (padrão oficial).
    messages.push({ role: "assistant", content: result.content });
  }

  const hitIterationCap = iteration >= maxIterations && finalStopReason === "pause_turn";
  if (hitIterationCap) {
    console.warn(`${logPrefix} atingiu o cap de ${maxIterations} iterações ainda em pause_turn — análise pode estar incompleta`);
  }

  return {
    accumulatedText,
    totalServerToolCalls,
    finalStopReason,
    iterationsUsed: iteration,
    finalMessages: messages,
    hitIterationCap,
  };
}
