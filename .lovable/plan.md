
# Plano de Implementacao: Pagina de Capturas

## Resumo
Implementar a pagina de Capturas completa com grid responsivo, filtros, modal de nova captura e visualizador fullscreen.

---

## Componentes a Criar

### 1. CaptureCard.tsx
Componente para exibir cada captura na grid:
- Thumbnail com aspect-ratio 4:3
- Overlay com tipo de captura (foto/video/360)
- Data da captura formatada
- Localizacao (piso/area)
- Avatar e nome de quem capturou
- Badge de status de processamento

### 2. CaptureFilters.tsx
Barra de filtros no topo:
- Select de obra (sites)
- Select de piso (floors) - dependente da obra
- DatePicker para filtro por data
- Select de tipo (foto/video/360)
- Botao para limpar filtros

### 3. NewCaptureModal.tsx
Modal para criar nova captura:
- Selecao hierarquica: Obra > Piso > Area > Ponto
- Tipo de captura (radio group)
- Upload de ficheiro com drag-and-drop
- Preview do ficheiro
- Campo de notas
- Botao de submit

### 4. CaptureViewer.tsx
Visualizador fullscreen:
- Imagem/video em tela cheia
- Overlay com informacoes
- Navegacao entre capturas (setas)
- Botao de fechar
- Opcao de download

---

## Estrutura de Dados

### Query Principal - Capturas com Joins
```text
captures
  -> capture_points (code, description)
    -> areas (name)
      -> floors (name, level)
        -> sites (name)
  -> profiles (full_name, avatar_url) via user_id
```

### Tipos TypeScript
- CaptureWithDetails: tipo composto com dados relacionados
- CaptureFiltersState: estado dos filtros

---

## Implementacao Detalhada

### Pagina Captures.tsx

**Estado:**
- captures: lista de capturas
- filters: estado dos filtros (siteId, floorId, dateRange, type)
- isLoading: estado de carregamento
- isCreateOpen: modal de nova captura
- selectedCapture: captura para visualizador
- isViewerOpen: estado do visualizador

**Queries React Query:**
1. useQuery para memberships do user
2. useQuery para sites das organizacoes
3. useQuery para floors (dependente de siteId)
4. useQuery para capturas com filtros aplicados

**Funcionalidades:**
- Grid responsivo: 1 col mobile, 2 tablet, 3 desktop
- Filtros com debounce
- Paginacao ou infinite scroll
- Estado vazio quando sem capturas

### Modal Nova Captura

**Fluxo:**
1. Selecionar obra
2. Carregar pisos da obra
3. Selecionar piso
4. Carregar areas do piso
5. Selecionar area
6. Carregar pontos da area
7. Selecionar ponto de captura
8. Escolher tipo (foto/video/360)
9. Upload do ficheiro
10. Adicionar notas (opcional)
11. Submeter

**Nota sobre Storage:**
Como o Storage ainda nao esta configurado, o upload guardara apenas o caminho/referencia. A integracao real com Storage sera feita posteriormente.

### Visualizador Fullscreen

**Features:**
- Dialog fullscreen com overlay escuro
- Imagem centrada com max-width/height
- Informacoes da captura em overlay
- Navegacao com teclas (esquerda/direita)
- Fechar com ESC ou botao
- Placeholder para imagens ate Storage estar configurado

---

## Componentes shadcn/ui Utilizados

- Card, CardContent
- Button
- Dialog, DialogContent, DialogHeader, DialogTitle
- Select, SelectTrigger, SelectContent, SelectItem
- RadioGroup, RadioGroupItem
- Input
- Label
- Badge
- Skeleton (loading state)
- Avatar, AvatarImage, AvatarFallback
- AspectRatio

---

## Traducoes a Adicionar

Novas chaves i18n para en.json e pt.json:
```text
captures.filterBySite
captures.filterByFloor
captures.filterByDate
captures.filterByType
captures.clearFilters
captures.location
captures.capturedBy
captures.capturedAt
captures.processing
captures.viewFullscreen
captures.download
captures.selectCapturePoint
```

---

## Ficheiros a Modificar/Criar

| Ficheiro | Accao |
|----------|-------|
| src/pages/app/Captures.tsx | Reescrever completamente |
| src/components/captures/CaptureCard.tsx | Criar |
| src/components/captures/CaptureFilters.tsx | Criar |
| src/components/captures/NewCaptureModal.tsx | Criar |
| src/components/captures/CaptureViewer.tsx | Criar |
| src/i18n/locales/en.json | Adicionar chaves |
| src/i18n/locales/pt.json | Adicionar chaves |

---

## Consideracoes Tecnicas

1. **RLS Policies**: As queries vao respeitar as policies existentes atraves de `is_org_member` e `can_access_site`

2. **Hierarquia de Dados**: captures > capture_points > areas > floors > sites - requer joins aninhados

3. **Performance**: Usar React Query para caching e evitar re-fetches desnecessarios

4. **Placeholder para Imagens**: Ate o Storage estar configurado, usar imagens placeholder do Unsplash ou SVG local

5. **Tipos de Captura**: Mapear `capture_source` enum para 3 categorias simples:
   - photo: phone_manual
   - video: drone_video, timelapse
   - panorama: phone_360, phone_360_auto

---

## Proximos Passos Apos Implementacao

1. Configurar Supabase Storage para uploads reais
2. Implementar geracao de thumbnails
3. Adicionar visualizador 360 para panoramas
4. Integrar com AI para analise automatica de capturas
