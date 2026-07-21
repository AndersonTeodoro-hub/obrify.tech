# ESPECIFICAÇÃO NORMATIVA — RESUMO DE ANÁLISE PAM (DOCUMENTO OFICIAL)

> **REGRA ABSOLUTA PARA O CLAUDE CODE:** este é o formato oficial da ferramenta
> de aprovação de materiais da plataforma Obrify. A réplica tem de ser 100% fiel.
> É PROIBIDO alterar, "melhorar", modernizar ou reinterpretar qualquer valor
> desta especificação. Nenhuma fonte, cor, margem, largura, padding ou secção
> pode ser mudada. Apenas os DADOS variam (via JSON, schema na secção 8).
> O ficheiro `modelo_resumo_pam.py` é a implementação de referência, validada
> com 0 píxeis de diferença contra o documento oficial PAM 011 de 17/07/2026.
> Em caso de dúvida entre esta especificação e qualquer outra ideia: vence a
> especificação. Não inventar rotas, componentes ou estilos adicionais.

## 1. Página

| Parâmetro | Valor |
|---|---|
| Formato | A4 retrato (595.2756 × 841.8898 pt) |
| Margem esquerda/direita (tabelas) | 34.01575 pt (12 mm) — tabelas de 186 mm centradas |
| Margem esquerda/direita (parágrafos) | 40.01575 pt (texto começa 6 pt à direita das tabelas) |
| Largura útil dos parágrafos | 515.2441 pt |
| Largura das tabelas | 527.2441 pt (186 mm) |
| Topo (1.ª linha do título) | topo do título a 807.5433 pt da base da página |
| Páginas | 1 (documento de página única) |

## 2. Tipografia (obrigatória — sem substituições)

| Elemento | Fonte | Tamanho | Entrelinha | Cor |
|---|---|---|---|---|
| Título | Helvetica-Bold | 13 pt | 11 pt | #000000 |
| Subtítulo (linha de contexto) | Helvetica | 7.5 pt | 11 pt | #555555 |
| Parágrafo do parecer e corpo (secções 3, 4, 5) | Helvetica | 8.5 pt | 11 pt | #000000 |
| Cabeçalhos de secção (1.–5.) | Helvetica-Bold | 10 pt | 11 pt | #000000 |
| Células de tabela | Helvetica | 8.5 pt | 11 pt | #000000 |
| Cabeçalho de tabela e linhas de fase | Helvetica-Bold | 8.5 pt | 11 pt | #000000 |

Encoding WinAnsi; caracteres pt-PT (á, ç, õ, º, Ø, –, —, ·) obrigatórios.

## 3. Cores (exatas, sem variação)

| Uso | Hex | RGB decimal (PDF) |
|---|---|---|
| Texto | #000000 | 0 0 0 |
| Subtítulo | #555555 | .333333 |
| Grelha das tabelas | #808080 | .501961 |
| Fundo do cabeçalho das tabelas | #D9D9D9 | .85098 |
| Fundo das linhas de fase (tabela 1) | #F2F2F2 | .94902 |

## 4. Espaçamentos verticais (pt)

| Transição | Espaço |
|---|---|
| Título → subtítulo | 2 |
| Subtítulo → parágrafo do parecer | 6 |
| Corpo/tabela → cabeçalho de secção seguinte | 8 |
| Cabeçalho de secção → tabela/corpo | 3 |

## 5. Tabelas

Comum às duas tabelas: grelha completa 0.5 pt #808080 (cantos redondos),
VALIGN topo, paddings esquerda 4 / direita 4 / topo 2 / fundo 2 pt,
linha de cabeçalho com fundo #D9D9D9 e Helvetica-Bold 8.5.

**Tabela da secção 1 (Artigos do MQT)** — 5 colunas, larguras fixas:
20 / 62 / 32 / 42 / 30 mm. Colunas: Artigo · Descrição · Ø (mm) ·
Quant. (m) · Norma. Cada fase do MQT é uma linha de subsecção com SPAN
em todas as colunas, fundo #F2F2F2 e texto Helvetica-Bold 8.5.

**Tabela da secção 2 (Secções dos CTE)** — 3 colunas, larguras fixas:
34 / 66 / 86 mm. Colunas: CTE / Secção · Requisito de projeto · Verificação.
Sem linhas de subsecção. Os veredictos na coluna Verificação começam sempre
por palavra-chave em maiúsculas (CONFORME, CONFORME POR EXCESSO,
NÃO CONFORME, A ACAUTELAR EM EXECUÇÃO) seguida de " — " e justificação.

## 6. Estrutura fixa do documento (ordem imutável)

1. **Título:** `Análise de Pedido de Aprovação de Materiais, PAM {numero}`
2. **Subtítulo:** `Obra 2602 — Hotel JW Marriott Palmares · Ferreira Build Power · Análise da Fiscalização ({âmbito documental}) · {data DD/MM/AAAA}`
3. **Parecer:** parágrafo iniciado por `Parecer final: {PARECER}` em bold
   (valores possíveis: APROVADO · APROVADO CONDICIONADO · REPROVADO),
   seguido de ` — ` e texto justificativo com identificação do material,
   marca/distribuidor e fabricante.
4. **Secção `1. Artigos do MQT abrangidos pelo PAM {numero}`** — tabela 5 colunas.
5. **Secção `2. Secções dos CTE (Memórias Descritivas) aplicáveis ao PAM {numero}`** — tabela 3 colunas.
6. **Secção `3. Documentos que suportam a aprovação`** — parágrafo corrido,
   itens separados por ` · `, terminado em ponto final.
7. **Secção `4. Documentos entregues sem aplicação ao PAM {numero}`** — parágrafo corrido.
8. **Secção `5. Condições da aprovação`** — parágrafo corrido com alíneas
   `a)`, `b)`, `c)`… (letra em bold), itens separados por `; `, ponto final.

## 7. Implementação de referência

`modelo_resumo_pam.py` (Python 3 + ReportLab) é a ÚNICA implementação
autorizada para gerar o PDF. Na Obrify, o backend chama:

```
python modelo_resumo_pam.py dados.json saida.pdf
```

ou importa `gerar_resumo_pam(dados_dict, caminho_saida)`. Se o backend for
Node/outro, invocar o script Python como processo — NÃO portar o layout para
outra biblioteca sem validação de 0 píxeis de diferença contra
`PAM011_replica.pdf`.

## 8. Schema dos dados (JSON)

```json
{
  "numero_pam": "011",
  "subtitulo": "Obra 2602 — ... · {data}",
  "parecer": "APROVADO CONDICIONADO",
  "parecer_texto": "— texto justificativo ...",
  "seccao1": {
    "grupos": [
      {
        "titulo": "Fase 1.1 — Pisos -5/-6 (Rev.02, Dez 2025)",
        "artigos": [
          {
            "artigo": "1.3.3.1–.3",
            "descricao": "...",
            "diametros": "125 / 160 / 200",
            "quantidades": "74,05 / 30,25 / 43,45",
            "norma": "EN ISO 1452 – PN10"
          }
        ]
      }
    ]
  },
  "seccao2": {
    "linhas": [
      { "seccao": "...", "requisito": "...", "verificacao": "CONFORME — ..." }
    ]
  },
  "seccao3": "Documento 1 (...) · Documento 2 (...).",
  "seccao4": "Texto corrido.",
  "seccao5": ["condição a", "condição b", "condição c"]
}
```

Regras dos dados: decimais com vírgula (74,05); diâmetros com ` / `;
travessão — em separadores de contexto; meia-risca – em intervalos
(1.3.3.1–.3, Ø110–630); datas DD/MM/AAAA.

## 9. Critério de aceitação

Uma implementação só é aceite se, alimentada com `pam011_dados.json`,
produzir um PDF com 0 píxeis de diferença (rasterização a 150 DPI) face a
`PAM011_replica.pdf`. Qualquer desvio = implementação rejeitada. Não existe
"aproximadamente igual".
