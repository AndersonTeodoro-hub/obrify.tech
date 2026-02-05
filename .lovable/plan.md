
# Plano: Upload Avancado para Pagina de Capturas

## Resumo
Reescrever o modal de nova captura com suporte a multiplos ficheiros, drag-and-drop, barra de progresso, upload real para o bucket "captures" e extracao automatica de metadata EXIF.

---

## Estado Actual

### O que existe:
- Modal `NewCaptureModal.tsx` com selecao hierarquica (Site > Floor > Area > Point)
- Upload de ficheiro unico com preview
- Tabela `captures` com campos: `file_path`, `size_bytes`, `mime_type`, `captured_at`
- Storage bucket "captures" (privado) com policies RLS configuradas
- Component `Progress` do shadcn/ui disponivel

### Limitacoes actuais:
- Apenas 1 ficheiro de cada vez
- Sem drag-and-drop real
- Sem upload para Storage (apenas placeholder)
- Sem extracao de metadata EXIF
- Sem barra de progresso

---

## Componentes a Criar/Modificar

### 1. Novo Utilitario: `src/lib/exif-parser.ts`
Funcao para extrair metadata EXIF de imagens:
- Data de captura (DateTimeOriginal)
- Coordenadas GPS (se disponiveis)
- Modelo da camera
- Orientacao

Utilizara a API nativa do browser (sem dependencias externas):
- FileReader para ler bytes
- Parsing manual dos tags EXIF
- Conversao de coordenadas GPS para decimal

### 2. Reescrever: `src/components/captures/NewCaptureModal.tsx`

**Novo Estado:**
```text
files: FileWithPreview[]     // Lista de ficheiros com previews
uploadProgress: Map<string, number>  // Progresso por ficheiro
isUploading: boolean
currentUploadIndex: number
```

**Interface FileWithPreview:**
```text
{
  file: File
  id: string (uuid local)
  preview: string (URL.createObjectURL)
  exifData: ExifData | null
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  error?: string
}
```

**Funcionalidades:**
1. Drag-and-drop com visual feedback
2. Limite de 10 ficheiros por vez
3. Preview em grid de cada ficheiro
4. Botao X para remover ficheiro da lista
5. Extracao EXIF automatica ao adicionar foto
6. Barra de progresso global e por ficheiro
7. Upload sequencial para Storage
8. Criar registo na tabela captures apos upload

### 3. Componente Auxiliar: `src/components/captures/FilePreviewGrid.tsx`
Grid de previews dos ficheiros selecionados:
- Thumbnail com aspect-ratio
- Badge com status (pendente/a carregar/sucesso/erro)
- Barra de progresso individual
- Botao remover
- Icone diferente para video vs foto vs 360

### 4. Componente Auxiliar: `src/components/captures/DropZone.tsx`
Area de drag-and-drop reutilizavel:
- Visual feedback ao arrastar
- Click para selecionar ficheiros
- Validacao de tipo de ficheiro
- Contagem de ficheiros

---

## Fluxo de Upload

```text
1. User arrasta/seleciona ficheiros
   ↓
2. Para cada ficheiro:
   - Gerar preview URL
   - Extrair EXIF (se imagem)
   - Adicionar a lista
   ↓
3. User preenche campos obrigatorios:
   - Selecionar Obra
   - Selecionar Piso
   - Selecionar Area
   - Selecionar Ponto (auto-criado se nao existir)
   ↓
4. User clica "Carregar"
   ↓
5. Para cada ficheiro (sequencial):
   a. Gerar path unico: captures/{org_id}/{site_id}/{point_id}/{timestamp}_{filename}
   b. Upload para Supabase Storage com onUploadProgress
   c. Actualizar progresso na UI
   d. Inserir registo em captures com metadata
   e. Marcar como sucesso ou erro
   ↓
6. Mostrar resumo final
   ↓
7. Fechar modal e refrescar lista
```

---

## Estrutura de Paths no Storage

```text
captures/
  {org_id}/
    {site_id}/
      {capture_point_id}/
        {timestamp}_{uuid}_{original_filename}
```

Exemplo:
```text
captures/abc123/site456/point789/1738702800000_uuid_foto_fachada.jpg
```

---

## Metadata EXIF a Extrair

Para imagens JPEG:
- `DateTimeOriginal` → captured_at
- `GPSLatitude` + `GPSLatitudeRef` → latitude
- `GPSLongitude` + `GPSLongitudeRef` → longitude
- `Make` + `Model` → device info (para logs)

Para video: usar `lastModified` do File como fallback

---

## Campos da Tabela captures

```text
id: uuid (auto)
capture_point_id: uuid (obrigatorio)
user_id: uuid (auth.uid())
file_path: string (path no storage)
source_type: enum (phone_manual por defeito)
processing_status: enum (PENDING)
captured_at: timestamp (EXIF ou now())
size_bytes: number (file.size)
mime_type: string (file.type)
```

---

## Traducoes a Adicionar

Novas chaves para `pt.json` e `en.json`:

```text
captures.dropFiles: "Arraste ficheiros ou clique para selecionar"
captures.maxFiles: "Maximo de 10 ficheiros por vez"
captures.filesSelected: "{{count}} ficheiro(s) selecionado(s)"
captures.uploadProgress: "A carregar {{current}} de {{total}}"
captures.extractingExif: "A extrair metadata..."
captures.uploadComplete: "Upload concluido com sucesso"
captures.uploadError: "Erro no upload de {{count}} ficheiro(s)"
captures.removeFile: "Remover ficheiro"
captures.retryUpload: "Tentar novamente"
captures.gpsExtracted: "Coordenadas GPS extraidas"
captures.dateExtracted: "Data de captura: {{date}}"
```

---

## Consideracoes Tecnicas

1. **RLS Policies**: O bucket "captures" ja tem policies configuradas para INSERT (users autenticados)

2. **Signed URLs**: O bucket e privado, precisaremos de signed URLs para exibir (a implementar depois)

3. **Limite de Tamanho**: Supabase tem limite de 50MB por ficheiro por defeito

4. **Performance**: Upload sequencial para evitar timeout e permitir tracking de progresso

5. **Cleanup**: Revogar URLs de preview ao fechar modal para libertar memoria

6. **Fallbacks**: Se EXIF falhar, usar data actual e sem coordenadas

---

## Simplificacao: Sem Ponto Obrigatorio

O requisito menciona apenas Obra, Piso, Area como obrigatorios. Vou simplificar:
- Se o user selecionar Area mas nao existirem pontos, criar um ponto automatico "Default"
- Ou tornar o ponto opcional e criar automaticamente

---

## Ficheiros a Criar/Modificar

| Ficheiro | Accao |
|----------|-------|
| src/lib/exif-parser.ts | Criar |
| src/components/captures/DropZone.tsx | Criar |
| src/components/captures/FilePreviewGrid.tsx | Criar |
| src/components/captures/NewCaptureModal.tsx | Reescrever |
| src/types/captures.ts | Adicionar tipos |
| src/i18n/locales/en.json | Adicionar chaves |
| src/i18n/locales/pt.json | Adicionar chaves |

---

## Proximos Passos Apos Implementacao

1. Criar Edge Function para gerar signed URLs ao exibir capturas
2. Implementar geracao automatica de thumbnails
3. Adicionar validacao de tipos de ficheiro mais robusta
4. Integrar com analise IA automatica apos upload
