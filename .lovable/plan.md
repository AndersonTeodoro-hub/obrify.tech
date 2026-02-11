
# Upload ate 2GB com Chunked Upload

## Resumo

Aumentar o limite de ficheiro de 500MB para 2GB, adicionar simulacao de upload por chunks de 50MB com barra de progresso no UploadModal, e actualizar todas as mensagens e textos relacionados. Actualizar formatFileSize para suportar GB.

## Alteracoes no ficheiro `src/pages/app/IncompatiCheck.tsx`

### 1. Constantes (linha 18)

Substituir `FILE_SIZE_LIMIT = 500 * 1024 * 1024` por:
- `FILE_SIZE_LIMIT = 2 * 1024 * 1024 * 1024` (2GB)
- Adicionar `CHUNK_SIZE = 50 * 1024 * 1024` (50MB)

### 2. UploadModal -- novos states (linha 227-228)

Adicionar states dentro do UploadModal:
- `uploading: boolean`
- `progress: number`
- `currentFile: string`

### 3. UploadModal -- refazer handleFile (linhas 233-238)

Converter para funcao `async`. Simular upload por chunks com loop e setTimeout. Actualizar progresso. Desactivar cancelar durante upload.

Alteracoes:
- Mensagem de limite: "Ficheiro excede o limite de 2GB."
- Simulacao: loop de `totalChunks = Math.ceil(file.size / CHUNK_SIZE)` com 300ms por chunk
- Limpar states apos conclusao

### 4. UploadModal -- textos (linhas 257, 273)

- Linha 257: `"Limite: 500MB"` muda para `"Limite: 2GB por ficheiro"`
- Linha 273: `"máx. 500MB"` muda para `"máx. 2GB"`

### 5. UploadModal -- bloco informativo ZIP (linhas 277-281)

Substituir por versao expandida com 3 linhas:
- ZIP: extraccao automatica
- Limite: 2GB, chunks de 50MB
- Formatos: PDF, DWG, DWF, IFC, ZIP, RAR, 7Z

### 6. UploadModal -- barra de progresso (antes linha 301)

Adicionar bloco condicional `{uploading && (...)}` com:
- Nome do ficheiro truncado + percentagem
- Barra de progresso com gradiente laranja
- Texto contextual ("upload por chunks de 50MB" para ficheiros grandes)

### 7. UploadModal -- botao Cancelar (linhas 301-308)

Adicionar `disabled={uploading}` e texto condicional. Estilos para estado desactivado.

### 8. formatFileSize no helpers.ts (linha 27-30)

Actualizar funcao para suportar GB (>= 1073741824 bytes).

### 9. Alerta no handleFile da sidebar (linha 234)

Mensagem actualizada para "2GB" em vez de "500MB".

## Ficheiros modificados

| Ficheiro | Alteracao |
|---|---|
| `src/pages/app/IncompatiCheck.tsx` | Constantes, UploadModal (states, handleFile async, progresso, textos, botao), alerta |
| `src/pages/app/incompaticheck/helpers.ts` | formatFileSize com suporte a GB |

## Nota

Nao e necessaria migracao SQL -- o bucket `project-files` ja existe e o limite de storage e gerido pela plataforma. A simulacao de chunks e local (frontend) para UX; em producao seria implementado via edge function.
