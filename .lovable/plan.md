

# Corrigir "Eng." para "Engª" no AgentPanel

## Problema

O texto exibe "Eng." (abreviatura masculina) quando deveria ser "Engª" (abreviatura correcta em portugues de Portugal para Engenheiro/a). Como o agente ElevenLabs le o texto tal como esta escrito, "Eng." e pronunciado literalmente em vez da palavra completa.

## Alteracoes

Ficheiro: `src/pages/app/incompaticheck/AgentPanel.tsx`

Substituir todas as ocorrencias de "Eng." por "Engenheiro" nos textos que sao falados/exibidos:

| Linha | Antes | Depois |
|---|---|---|
| 91 | `Erro na ligação com o Eng. Marcos` | `Erro na ligação com o Engenheiro Marcos` |
| 136 | `Não foi possível ligar ao Eng. Marcos` | `Não foi possível ligar ao Engenheiro Marcos` |
| 188 | `Eng. Marcos está a falar...` | `Engenheiro Marcos está a falar...` |
| 221 | `Eng. Marcos IA` | `Engº Marcos IA` |

Nota: Para o titulo visual (linha 221) usar "Engº" (abreviatura masculina correcta). Para textos que podem ser lidos em voz alta, usar "Engenheiro" por extenso para evitar que o TTS pronuncie a abreviatura incorrectamente.

