import { assert, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { AMBITO, SPIKE_PERSONA_VOZ, buildSilvaSystemPrompt } from "./silvaPersona.ts";

Deno.test("modo texto inclui a guarda de âmbito", () => {
  assertStringIncludes(buildSilvaSystemPrompt({ mode: "texto" }), AMBITO);
});

Deno.test("modo voz inclui a guarda de âmbito", () => {
  assertStringIncludes(buildSilvaSystemPrompt({ mode: "voz" }), AMBITO);
});

Deno.test("a guarda precede as regras de conduta", () => {
  const p = buildSilvaSystemPrompt({ mode: "texto" });
  assert(
    p.indexOf("ÂMBITO") < p.indexOf("CONDUTA:"),
    "a regra de âmbito tem de vir antes de CONDUTA (a regra 1 manda responder primeiro)",
  );
});

Deno.test("a guarda sobrevive à injeção de catálogo e contexto da obra", () => {
  const p = buildSilvaSystemPrompt({ mode: "voz", catalogo: "Fase 1.1", analysisContext: "obra X" });
  assertStringIncludes(p, AMBITO);
});

Deno.test("o spike de voz em tempo real usa a mesma guarda", () => {
  assertStringIncludes(SPIKE_PERSONA_VOZ, AMBITO);
});

Deno.test("o spike ja nao instrui a responder a qualquer pergunta", () => {
  assert(
    !/responde a qualquer pergunta/i.test(SPIKE_PERSONA_VOZ),
    "a instrucao 'responde a qualquer pergunta' contradiz a guarda de ambito",
  );
});
