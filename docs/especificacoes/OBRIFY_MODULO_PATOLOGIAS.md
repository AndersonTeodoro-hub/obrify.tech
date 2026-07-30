# OBRIFY — Módulo de Deteção de Patologias por Fotografia
## Documento de Implementação Técnica

**Versão:** 1.0
**Data:** 2026-07-23
**Estado:** Especificação para implementação via Claude Code
**Dependências:** Módulo de Relatório Fotográfico (existente), Supabase (existente)

---

## 1. OBJETIVO

Dotar o fluxo de captura fotográfica existente da Obrify de capacidade de **triagem automática de patologias e divergências construtivas**, com análise profunda apenas das fotos sinalizadas, mantendo o custo operacional marginal próximo de zero.

### 1.1 Princípios de desenho (NÃO NEGOCIÁVEIS)

1. **A IA sinaliza, o fiscal decide.** Nenhuma saída do sistema é apresentada como "patologia confirmada". Toda a deteção é uma **suspeita** sujeita a validação humana.
2. **Custo acoplado ao existente.** A triagem é embutida na chamada de descrição de foto que já existe no relatório fotográfico — não é uma chamada adicional.
3. **Análise profunda só quando justificada.** O modelo forte só é invocado para fotos com flag de anomalia.
4. **Zero invenção.** As regras anti-alucinação do CLAUDE.md do projeto aplicam-se integralmente: o modelo não inventa causas, não inventa normas, não inventa soluções. Quando a base de conhecimento não cobre o caso, a saída declara explicitamente "fora da base de conhecimento — requer avaliação especializada".
5. **Feedback registado.** Toda a confirmação/rejeição de flag pelo fiscal é persistida para construir o dataset proprietário da Obrify.

---

## 2. ARQUITETURA — PIPELINE EM DOIS ESTÁGIOS

```
CAPTURA (app, obra)
  │  fiscal seleciona: zona / nível / fase / ambiente → tira foto
  ▼
UPLOAD → Supabase Storage + registo em `fotos`
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ ESTÁGIO 1 — TRIAGEM (batch, fim do dia, Haiku)     │
│ • Descrição da foto para o relatório (já existe)   │
│ • + Rastreio de anomalias (NOVO, mesma chamada)    │
│ • Output estruturado JSON                          │
└─────────────────────────────────────────────────────┘
  │
  ├── anomalia.detetada = false ──► segue para o relatório normal
  │
  └── anomalia.detetada = true
        ▼
┌─────────────────────────────────────────────────────┐
│ ESTÁGIO 2 — ANÁLISE PROFUNDA (batch, Sonnet)       │
│ • Foto + metadados + fichas relevantes da base de  │
│   conhecimento (RAG)                               │
│ • Output: mini-ficha de patologia (formato PATORREB)│
└─────────────────────────────────────────────────────┘
  │
  ▼
RELATÓRIO DIÁRIO
  • Secção normal: fotos + descrições
  • Secção "⚠ Anomalias sinalizadas — requer verificação do fiscal"
  ▼
VALIDAÇÃO DO FISCAL (na plataforma)
  • Confirmar / Reclassificar / Descartar
  • Decisão persistida em `anomalias_feedback`
```

---

## 3. MODELOS E CUSTOS

| Estágio | Modelo | Justificação | Modalidade |
|---|---|---|---|
| Triagem | `claude-haiku-4-5-20251001` | Tarefa de sinalização, não de diagnóstico; visão suficiente; custo mínimo | Batch API (desconto) |
| Análise profunda | `claude-sonnet-4-6` | Rigor técnico; cruzamento com base de conhecimento | Batch API (desconto) |

**Regras de custo:**
- A triagem NUNCA gera uma chamada API própria — é um campo adicional no prompt de descrição já existente.
- Processamento em **batch ao fim do dia** (o relatório não é tempo real). Usar a Batch API da Anthropic.
- **Prompt caching** obrigatório para: instruções de sistema, taxonomia de anomalias, e (no estágio 2) as fichas da base de conhecimento recorrentes.
- Confirmar preços atuais em https://docs.claude.com antes de fixar projeções — não usar valores hardcoded de memória.

**Estimativa de volume por obra:** 30 fotos/dia em triagem embutida (custo já pago pelo relatório) + expectativa de 5–10% com flag → 2–3 análises profundas/dia.

---

## 4. ESTÁGIO 1 — TRIAGEM EMBUTIDA

### 4.1 Alteração ao prompt existente de descrição de foto

O prompt atual de descrição passa a exigir output JSON estruturado com dois blocos. **Manter integralmente o comportamento atual da descrição** — a alteração é aditiva.

### 4.2 System prompt (Estágio 1)

```
És um assistente de fiscalização de obras. Recebes uma fotografia de obra
com metadados de localização (zona, nível, fase, ambiente).

TAREFA 1 — DESCRIÇÃO: descreve objetivamente o que está a ser executado
na fotografia, em pt-PT, linguagem técnica de fiscalização, 2–4 frases.
Descreve APENAS o que é visível. Não infiras trabalhos não visíveis.

TAREFA 2 — RASTREIO DE ANOMALIAS: verifica se a fotografia mostra indícios
visíveis de patologia construtiva ou divergência de execução.

Taxonomia de anomalias (usa EXCLUSIVAMENTE estas categorias):
- fissuracao            (fissuras, fendas em qualquer elemento)
- humidade              (manchas, infiltrações, condensações, eflorescências)
- betao_defeituoso      (segregação, chochos, recobrimento insuficiente,
                         armadura exposta, juntas mal executadas)
- desalinhamento        (prumo, nível, alinhamento fora do aparente admissível)
- revestimento          (descolamento, empolamento, fissuração de reboco/
                         cerâmico, deficiência de assentamento)
- impermeabilizacao     (telas mal sobrepostas, remates deficientes,
                         pontos singulares mal resolvidos)
- corrosao              (oxidação de elementos metálicos ou armaduras)
- execucao_divergente   (execução visivelmente diferente da boa prática
                         para a fase/elemento indicado nos metadados)
- outra                 (anomalia visível não enquadrável nas anteriores)

REGRAS DE RASTREIO:
1. Sinaliza APENAS o que é visível na imagem. Nunca especules sobre o que
   não se vê.
2. Usa os metadados (fase, ambiente) para calibrar: uma junta de betonagem
   aparente NÃO é fissura; betão fresco com brilho NÃO é humidade patológica;
   elementos por concluir NÃO são execução divergente.
3. Em caso de dúvida razoável, sinaliza com confianca "baixa" — a triagem
   prefere falso positivo a falso negativo, mas a confiança deve ser honesta.
4. NÃO diagnostiques causas neste estágio. NÃO proponhas soluções neste
   estágio. Apenas sinaliza e classifica.

FORMATO DE SAÍDA: responde APENAS com JSON válido, sem markdown, sem
preâmbulo:
{
  "descricao": "string",
  "anomalia": {
    "detetada": true|false,
    "tipo": "categoria da taxonomia | null",
    "confianca": "alta|media|baixa|null",
    "evidencia_visivel": "string curta descrevendo o indício | null"
  }
}
```

### 4.3 User message (Estágio 1)

```
Metadados da captura:
- Obra: {obra_nome}
- Zona: {zona}
- Nível: {nivel}
- Fase: {fase}
- Ambiente: {ambiente}
- Data/hora: {timestamp}

[imagem em base64]
```

### 4.4 Validação da resposta

- Parse JSON com try/catch; em falha de parse, repetir 1x; em segunda falha, registar erro e marcar foto como `triagem_falhou` (nunca bloquear o relatório).
- Validar `tipo` contra a taxonomia; valor fora da lista → normalizar para `outra`.
- `detetada=true` sem `evidencia_visivel` → tratar como `confianca: baixa`.

---

## 5. ESTÁGIO 2 — ANÁLISE PROFUNDA

### 5.1 Trigger

Executa em batch, após o Estágio 1, para todas as fotos do dia com `anomalia.detetada = true`.

### 5.2 Base de conhecimento (RAG)

**Fonte primária:** fichas de patologia estilo PATORREB (www.patorreb.com — catálogo académico da FEUP + 7 universidades, acesso gratuito mediante inscrição).

> ⚠ **AÇÃO PRÉVIA OBRIGATÓRIA:** verificar as condições de utilização do
> catálogo PATORREB antes de integração comercial. Enquanto a licença não
> estiver clarificada, a base de conhecimento usa fichas PRÓPRIAS redigidas
> no mesmo formato (ver 5.3), alimentadas pela experiência da equipa e por
> bibliografia licenciável.

**Estrutura de indexação (Supabase, tabela `kb_patologias`):**

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| elemento_construtivo | text | ex.: parede exterior, laje, cobertura, fundação |
| fenomeno | text | alinhado com a taxonomia do Estágio 1 |
| titulo | text | |
| descricao_patologia | text | |
| sondagens_medidas | text | métodos de diagnóstico |
| causas_provaveis | text | |
| solucoes_reparacao | text | |
| fase_tipica | text[] | fases de obra onde tipicamente surge |
| fonte | text | referência bibliográfica/origem |
| embedding | vector | pgvector, para retrieval semântico |

**Retrieval:** por `fenomeno` (match direto com o tipo da triagem) + similaridade semântica sobre `evidencia_visivel` + filtro por `elemento_construtivo` inferido dos metadados. Máximo 3–5 fichas no contexto.

### 5.3 System prompt (Estágio 2)

```
És um engenheiro especialista em patologia da construção, a apoiar a
fiscalização de obras. Recebes: (a) uma fotografia sinalizada com suspeita
de anomalia, (b) os metadados de localização/fase, (c) o resultado da
triagem, (d) fichas de patologia relevantes da base de conhecimento.

TAREFA: produzir uma mini-ficha de análise da anomalia, em pt-PT.

REGRAS ABSOLUTAS:
1. Baseia a análise EXCLUSIVAMENTE: no que é visível na fotografia, nos
   metadados fornecidos, e no conteúdo das fichas da base de conhecimento.
2. NÃO cites normas, valores-limite ou requisitos regulamentares que não
   constem das fichas fornecidas. Se a avaliação exigir norma não fornecida,
   escreve: "verificação normativa requerida — norma não disponível no
   contexto".
3. Se as fichas fornecidas não cobrirem o fenómeno observado, declara:
   "fora da base de conhecimento — requer avaliação especializada" e
   limita-te à descrição objetiva do observado.
4. Distingue SEMPRE entre o que é observado (facto) e o que é hipótese
   (causa provável). Usa linguagem de probabilidade honesta.
5. Toda a saída é uma ANÁLISE PRELIMINAR para validação do fiscal — nunca
   um diagnóstico definitivo. A última linha da ficha é sempre:
   "Análise preliminar automática. Sujeita a verificação e validação pela
   Fiscalização."

FORMATO DE SAÍDA: responde APENAS com JSON válido:
{
  "fenomeno_observado": "string — descrição técnica objetiva do visível",
  "localizacao": "string — composta dos metadados",
  "gravidade_aparente": "critica|relevante|menor|indeterminada",
  "justificacao_gravidade": "string curta",
  "causas_provaveis": ["string", "..."],
  "sondagens_recomendadas": ["string", "..."],
  "solucoes_possiveis": ["string", "..."],
  "fichas_kb_usadas": ["id ou título das fichas consultadas"],
  "limitacoes": "string — o que a análise NÃO permite concluir",
  "requer_urgencia": true|false
}

CRITÉRIO DE URGÊNCIA: requer_urgencia=true APENAS para indícios visíveis
de risco estrutural ou de segurança (ex.: fissuração estrutural ativa
aparente, armadura principal exposta em elemento em carga, deformação
visível). Na dúvida, false — a urgência falsa banaliza o alerta.
```

### 5.4 User message (Estágio 2)

```
FOTO SINALIZADA:
[imagem em base64]

METADADOS:
{obra, zona, nivel, fase, ambiente, timestamp}

RESULTADO DA TRIAGEM:
{tipo, confianca, evidencia_visivel}

FICHAS DA BASE DE CONHECIMENTO:
{3–5 fichas recuperadas, texto integral dos campos relevantes}
```

---

## 6. MODELO DE DADOS (Supabase)

### 6.1 Alterações à tabela existente `fotos` (ou equivalente)

Adicionar colunas:

```sql
ALTER TABLE fotos ADD COLUMN triagem_anomalia jsonb;        -- output Estágio 1
ALTER TABLE fotos ADD COLUMN triagem_estado text            -- ok | triagem_falhou
  DEFAULT 'ok';
```

### 6.2 Nova tabela `anomalias`

```sql
CREATE TABLE anomalias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foto_id uuid REFERENCES fotos(id) NOT NULL,
  obra_id uuid NOT NULL,
  tipo text NOT NULL,
  confianca_triagem text NOT NULL,
  analise jsonb,                    -- output completo do Estágio 2
  gravidade_aparente text,
  requer_urgencia boolean DEFAULT false,
  estado text NOT NULL DEFAULT 'pendente',
    -- pendente | confirmada | reclassificada | descartada
  criado_em timestamptz DEFAULT now()
);
```

### 6.3 Nova tabela `anomalias_feedback` (o ativo de dados)

```sql
CREATE TABLE anomalias_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anomalia_id uuid REFERENCES anomalias(id) NOT NULL,
  fiscal_id uuid NOT NULL,
  decisao text NOT NULL,            -- confirmada | reclassificada | descartada
  tipo_corrigido text,              -- preenchido se reclassificada
  observacoes text,
  decidido_em timestamptz DEFAULT now()
);
```

### 6.4 Nova tabela `kb_patologias`

Conforme secção 5.2. Requer extensão `pgvector` ativa no Supabase.

---

## 7. INTEGRAÇÃO NO RELATÓRIO DIÁRIO

1. **Secção fotográfica normal:** inalterada (foto + localização + descrição).
2. **Nova secção final: "Anomalias Sinalizadas — Verificação Requerida".**
   - Uma entrada por anomalia: miniatura, localização, tipo, confiança, gravidade aparente, resumo da análise (fenómeno + 1.ª causa provável).
   - Rodapé fixo da secção: *"As anomalias listadas são deteções automáticas preliminares. A confirmação, classificação e decisão sobre ações corretivas são da exclusiva responsabilidade da Fiscalização."*
3. **Anomalias com `requer_urgencia=true`:** além do relatório, gerar notificação imediata na plataforma (não esperar pelo batch do relatório — nestes casos o Estágio 2 corre on-demand logo após a triagem; exceção justificada à regra do batch).
4. **Interface de validação:** no detalhe da anomalia, três ações — **Confirmar** / **Reclassificar** (com seleção de tipo correto) / **Descartar** (com motivo opcional). Toda a ação grava em `anomalias_feedback`.

---

## 8. FASEAMENTO DA IMPLEMENTAÇÃO

**Fase 1 — Triagem (entrega mínima útil)**
- Alterar prompt de descrição de foto para output estruturado (secção 4)
- Colunas novas em `fotos`; tabela `anomalias` (sem Estágio 2)
- Secção de anomalias no relatório com dados só da triagem
- Interface de validação + `anomalias_feedback`
- ✔ Critério de aceitação: relatório diário lista anomalias sinalizadas com tipo/confiança; fiscal consegue confirmar/descartar; nenhuma foto sem descrição por falha de triagem.

**Fase 2 — Base de conhecimento**
- Tabela `kb_patologias` + pgvector + pipeline de ingestão de fichas
- Carregar conjunto inicial de fichas próprias (mínimo 20, cobrindo a taxonomia)
- Clarificar licença PATORREB; se viável, ingerir catálogo
- ✔ Critério de aceitação: retrieval devolve fichas relevantes para cada tipo da taxonomia.

**Fase 3 — Análise profunda**
- Batch Estágio 2 sobre anomalias pendentes do dia
- Mini-ficha no detalhe da anomalia e no relatório
- Caminho urgente (on-demand) para `requer_urgencia`
- ✔ Critério de aceitação: anomalia sinalizada de manhã tem mini-ficha completa no relatório do próprio dia; caso urgente notifica em minutos.

**Fase 4 — Aprendizagem**
- Dashboard de métricas: taxa de flags, taxa de confirmação por tipo, falsos positivos recorrentes
- Ajuste iterativo do prompt de triagem com base nos padrões de `anomalias_feedback`
- ✔ Critério de aceitação: taxa de confirmação de flags ≥ 50% após ajustes (meta indicativa, calibrar com dados reais).

---

## 9. REGRAS PARA O CLAUDE CODE (aplicar o CLAUDE.md do projeto)

1. Não criar rotas, tabelas, campos ou abstrações além dos especificados neste documento. Qualquer necessidade adicional identificada → reportar antes de implementar, nunca implementar por iniciativa.
2. Reutilizar o pipeline existente do relatório fotográfico; a triagem é uma extensão do prompt existente, não um serviço paralelo.
3. Todos os prompts do módulo vivem em ficheiros versionados (ex.: `prompts/patologias/triagem.md`, `prompts/patologias/analise.md`) — nunca hardcoded em strings no código.
4. Nomes de modelos em variáveis de ambiente/configuração, nunca hardcoded.
5. Testes obrigatórios: parse de JSON malformado; foto sem metadados; taxonomia inválida na resposta; retrieval vazio (KB sem ficha para o fenómeno); falha da Batch API a meio do lote.
6. Relatório de implementação factual no fim de cada fase (o que foi feito, o que ficou por fazer, divergências face a este documento), conforme o fluxo de auditoria já estabelecido no projeto.

---

## 10. REFERÊNCIAS

- PATORREB — Grupo de Estudos da Patologia da Construção, FEUP: www.patorreb.com (catálogo de fichas de patologia; verificar condições de utilização)
- Datasets de imagem para eventual evolução futura de deteção treinada: SDNET2018 (56.000+ imagens de fissuração em betão), dacl10k (9.920 imagens, inclui corrosão/delaminação/eflorescências), CODEBRIM (defeitos de betão em pontes)
- Batch API e prompt caching: https://docs.claude.com

---

*Documento preparado para implementação na plataforma Obrify (obrify.tech). A análise automática de patologias é uma ferramenta de apoio à Fiscalização; a responsabilidade técnica pelas decisões permanece integralmente humana.*
