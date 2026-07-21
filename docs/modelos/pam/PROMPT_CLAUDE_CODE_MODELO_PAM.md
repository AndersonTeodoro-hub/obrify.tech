# PROMPT PARA O CLAUDE CODE — INTEGRAÇÃO DO MODELO OFICIAL DE RESUMO PAM NA OBRIFY

Copiar tudo abaixo desta linha e colar no Claude Code, com os 4 ficheiros já colocados na pasta indicada no passo 0.

---

## MISSÃO

Integrar na plataforma Obrify o gerador oficial de Resumos de Análise PAM (Pedido de Aprovação de Materiais). O formato é um DOCUMENTO OFICIAL DE FISCALIZAÇÃO já validado e congelado. A tua missão é EXCLUSIVAMENTE de integração — não é de design, não é de melhoria, não é de reescrita.

## REGRAS ABSOLUTAS (violação = trabalho rejeitado)

1. É PROIBIDO alterar qualquer linha de `modelo_resumo_pam.py`. O ficheiro entra no repositório tal como está, byte a byte. Se acreditares que há um erro no ficheiro, PARA e reporta — não corrijas por iniciativa própria.
2. É PROIBIDO portar o layout para outra biblioteca (Puppeteer, pdfkit, pdf-lib, jsPDF, wkhtmltopdf, LaTeX, HTML/CSS print, ou qualquer outra). O PDF é gerado ÚNICA E EXCLUSIVAMENTE pelo script Python com ReportLab.
3. É PROIBIDO alterar fontes, tamanhos, cores, margens, larguras de coluna, paddings, espaçamentos, ordem das secções ou textos fixos dos títulos. Todos os valores estão em `ESPECIFICACAO_MODELO_PAM.md` e são normativos.
4. É PROIBIDO criar rotas, componentes, serviços, tabelas de base de dados ou abstrações para além do mínimo definido na secção "ÂMBITO" abaixo. Nada de "já agora aproveitei para...".
5. É PROIBIDO inventar dados. O gerador recebe apenas o JSON no schema oficial (secção 8 da especificação). Campos em falta = erro de validação devolvido ao utilizador, nunca preenchimento automático.
6. Qualquer dúvida ou ambiguidade: PARA, formula a pergunta, e aguarda decisão. Não decidas por analogia nem por "boa prática". Neste projeto, fidelidade > elegância.
7. No fim, produz o relatório de auditoria definido em "RELATÓRIO OBRIGATÓRIO". Sem relatório com evidências, o trabalho considera-se não entregue.

## PASSO 0 — FICHEIROS DE ENTRADA (já fornecidos, não recriar)

Colocados em `docs/modelos/pam/` (criar a pasta se não existir):
- `ESPECIFICACAO_MODELO_PAM.md` — especificação normativa congelada
- `modelo_resumo_pam.py` — gerador oficial (Python 3 + ReportLab). NÃO EDITAR
- `pam011_dados.json` — dados de teste oficiais (caso de aceitação)
- `PAM011_replica.pdf` — PDF padrão-ouro para comparação

Antes de escrever qualquer código: lê `ESPECIFICACAO_MODELO_PAM.md` na íntegra e confirma no relatório que a leste. Verifica com `sha256sum` que `modelo_resumo_pam.py` no repositório é idêntico ao fornecido e regista o hash no relatório.

## ÂMBITO (fechado — nem mais, nem menos)

1. **Runtime Python:** garantir Python 3 + `reportlab` no ambiente da Obrify (adicionar `requirements.txt` ou equivalente no serviço/container onde o script corre). Regista a versão do reportlab instalada.
2. **Serviço de geração:** uma única função/endpoint no backend existente da Obrify — `POST /api/pam/resumo` (ou o padrão de rotas JÁ existente no projeto; usa a convenção atual, não inventes uma nova) que:
   - recebe o JSON no schema oficial;
   - valida contra o schema (campos obrigatórios: `numero_pam`, `subtitulo`, `parecer`, `parecer_texto`, `seccao1.grupos[].titulo`, `seccao1.grupos[].artigos[]` com `artigo/descricao/diametros/quantidades/norma`, `seccao2.linhas[]` com `seccao/requisito/verificacao`, `seccao3`, `seccao4`, `seccao5[]`);
   - valida o campo `parecer` contra a lista fechada: `APROVADO`, `APROVADO CONDICIONADO`, `REPROVADO`;
   - invoca o script como processo: `python3 modelo_resumo_pam.py <dados.json> <saida.pdf>` (ou importa `gerar_resumo_pam` se o backend for Python);
   - devolve o PDF gerado com nome `PAM{numero}_Resumo.pdf`.
3. **Formulário/UI:** apenas se a Obrify já tiver o padrão de formulários estabelecido — um formulário que preenche o JSON do schema, sem campos extra e sem remover campos. Se o padrão de UI não for claro, entrega só o endpoint e reporta.
4. **Teste automático de fidelidade:** um teste no runner de testes existente que:
   - gera o PDF a partir de `pam011_dados.json`;
   - rasteriza o resultado e o `PAM011_replica.pdf` a 150 DPI (`pdftoppm -png -r 150`);
   - compara pixel a pixel e FALHA se houver 1 ou mais píxeis diferentes.

## CRITÉRIO DE ACEITAÇÃO (único e não negociável)

O teste do ponto 4 tem de passar com exatamente 0 píxeis de diferença. Não existe "praticamente igual", "visualmente idêntico" ou "diferença negligenciável". 1 píxel = rejeitado.

Comando de verificação manual equivalente:

```bash
python3 docs/modelos/pam/modelo_resumo_pam.py docs/modelos/pam/pam011_dados.json /tmp/saida.pdf
pdftoppm -png -r 150 /tmp/saida.pdf /tmp/gerado
pdftoppm -png -r 150 docs/modelos/pam/PAM011_replica.pdf /tmp/padrao
python3 - << 'EOF'
from PIL import Image, ImageChops
import numpy as np
d = np.array(ImageChops.difference(
    Image.open('/tmp/gerado-1.png').convert('RGB'),
    Image.open('/tmp/padrao-1.png').convert('RGB')))
n = int((d.sum(axis=2) > 0).sum())
print('pixels diferentes:', n)
assert n == 0, 'REJEITADO — o PDF não é uma réplica fiel'
print('APROVADO — réplica 100% fiel')
EOF
```

## RELATÓRIO OBRIGATÓRIO NO FIM

Entrega um relatório factual (sem opiniões, sem adjetivos) com:
1. Confirmação de leitura integral da especificação.
2. `sha256sum` de `modelo_resumo_pam.py` no repositório, provando que não foi alterado.
3. Lista exata de ficheiros criados/alterados (caminhos completos) e justificação de cada um face ao ÂMBITO. Qualquer ficheiro fora do âmbito = explicar porquê ou remover.
4. Output integral do teste de fidelidade com a linha `pixels diferentes: 0`.
5. Versões: Python, reportlab, poppler-utils (pdftoppm).
6. Lista de dúvidas/pontos que ficaram por decidir (se nenhuma, escrever "nenhuma").

## O QUE FAZER SE ALGO FALHAR

- Se o ambiente não tiver Python/poppler e não for possível instalar: PARA e reporta a limitação com o erro exato. Não substituas por outra biblioteca.
- Se o teste de fidelidade falhar: NÃO ajustes o modelo para "aproximar". Reporta o diff (contagem de píxeis e zona) e para.
- Se o schema JSON parecer insuficiente para um caso real: reporta o caso; não alteres o schema.
