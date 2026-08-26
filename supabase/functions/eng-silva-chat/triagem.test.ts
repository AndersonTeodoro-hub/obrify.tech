import { assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { parseTriagemResponse } from "../_shared/patologiasTriagem.ts";

Deno.test("aceita JSON em cerca e normaliza tipo válido", () => {
  const r = parseTriagemResponse(
    '```json\n{"descricao":"Pilar em betão à vista.","anomalia":{"detetada":true,"tipo":"fissuracao","confianca":"media","evidencia_visivel":"fissura vertical na face"}}\n```',
  );
  assertEquals(r.descricao, "Pilar em betão à vista.");
  assertEquals(r.anomalia.tipo, "fissuracao");
  assertEquals(r.anomalia.confianca, "media");
  assertEquals(r.anomalia.evidencia_visivel, "fissura vertical na face");
});

Deno.test("tipo fora da taxonomia -> outra", () => {
  const r = parseTriagemResponse(
    '{"descricao":"Face de laje.","anomalia":{"detetada":true,"tipo":"inventado","confianca":"alta","evidencia_visivel":"mancha escura"}}',
  );
  assertEquals(r.anomalia.tipo, "outra");
});

Deno.test("detetada sem evidencia -> confianca baixa", () => {
  const r = parseTriagemResponse(
    '{"descricao":"Parede rebocada.","anomalia":{"detetada":true,"tipo":"humidade","confianca":"alta","evidencia_visivel":""}}',
  );
  assertEquals(r.anomalia.confianca, "baixa");
});

Deno.test("nao detetada -> tipo null e evidencia vazia", () => {
  const r = parseTriagemResponse(
    '{"descricao":"Laje limpa e concluída.","anomalia":{"detetada":false,"tipo":"fissuracao","confianca":"alta","evidencia_visivel":"lixo"}}',
  );
  assertEquals(r.anomalia.detetada, false);
  assertEquals(r.anomalia.tipo, null);
  assertEquals(r.anomalia.evidencia_visivel, "");
});

Deno.test("JSON invalido lanca (aciona retry no handler)", () => {
  assertThrows(() => parseTriagemResponse("desculpa, não consigo analisar"));
});

Deno.test("descricao vazia lanca", () => {
  assertThrows(() =>
    parseTriagemResponse('{"descricao":"   ","anomalia":{"detetada":false,"tipo":null,"confianca":"baixa","evidencia_visivel":""}}')
  );
});
