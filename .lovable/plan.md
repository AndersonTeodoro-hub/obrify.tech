
# Plano: CaptureViewer Avancado com Zoom e Visualizador 360

## Resumo
Reescrever o componente CaptureViewer com funcionalidades avancadas: zoom com scroll/gestos touch, painel lateral de informacoes, accoes (download, eliminar, criar NC), visualizador panoramico para imagens 360 e navegacao por teclado.

---

## Estado Actual

### O que existe:
- Componente `CaptureViewer.tsx` basico com:
  - Dialog fullscreen com overlay escuro
  - Navegacao com setas (botoes e teclado)
  - Imagem estatica (placeholder Unsplash)
  - Info overlay no fundo com data, localizacao, autor
  - Botao de download (sem funcao)
  - Contador de posicao

### Limitacoes actuais:
- Sem zoom (scroll ou gestos)
- Sem painel lateral estruturado
- Sem accoes funcionais (download, eliminar, criar NC)
- Sem suporte para 360
- Usa imagens placeholder em vez de Storage

---

## Arquitectura do Novo Componente

```text
CaptureViewer (container principal)
├── Toolbar (topo)
│   ├── Botao Fechar (X)
│   ├── Contador (1 de N)
│   └── Accoes (Download, Eliminar, Criar NC)
│
├── Content Area (centro)
│   ├── Navegacao Esquerda (seta)
│   ├── Media Viewer
│   │   ├── ImageViewer (fotos com zoom)
│   │   ├── VideoPlayer (videos)
│   │   └── PanoramaViewer (360)
│   └── Navegacao Direita (seta)
│
└── Info Panel (lateral direita, colapsavel)
    ├── Thumbnail
    ├── Metadados (data, tipo, tamanho)
    ├── Localizacao (obra/piso/area/ponto)
    ├── Autor (avatar, nome)
    └── Notas
```

---

## Componentes a Criar

### 1. Componente Principal: `CaptureViewer.tsx` (reescrever)

**Props:**
```text
capture: CaptureWithDetails | null
captures: CaptureWithDetails[]
open: boolean
onOpenChange: (open: boolean) => void
onNavigate: (capture: CaptureWithDetails) => void
onDelete?: (capture: CaptureWithDetails) => void
onCreateNC?: (capture: CaptureWithDetails) => void
```

**Estado:**
```text
zoom: number (1 = 100%)
position: { x: number, y: number }
isPanning: boolean
showInfoPanel: boolean
isDeleting: boolean
```

**Funcionalidades:**
- Layout com painel lateral toggleable
- Toolbar no topo com accoes
- Area central para media
- Gestao de zoom e pan

### 2. Subcomponente: `ImageViewerWithZoom.tsx`

Visualizador de imagens com zoom:
- Zoom com scroll do rato (wheel event)
- Zoom com pinch gesture (touch events)
- Pan/arrastar quando em zoom
- Double-click para reset zoom
- Limites de zoom: 0.5x a 5x

**Implementacao:**
```text
- CSS transform: scale() translate()
- onWheel para zoom
- onTouchStart/Move/End para gestos
- onMouseDown/Move/Up para pan
- Cursor: grab/grabbing
```

### 3. Subcomponente: `PanoramaViewer.tsx`

Visualizador 360 com biblioteca leve:

**Opcao escolhida: Photo Sphere Viewer (leve, React-friendly)**
- Biblioteca: @photo-sphere-viewer/core
- Licenca: MIT
- Tamanho: ~50KB gzipped
- Suporte: touch, VR, hotspots

**Funcionalidades:**
- Navegacao com drag do rato
- Navegacao touch
- Zoom in/out
- Autorotacao opcional
- Fullscreen dentro do viewer

### 4. Subcomponente: `CaptureInfoPanel.tsx`

Painel lateral com informacoes detalhadas:
- Toggle button para mostrar/esconder
- Scroll interno para conteudo longo
- Seccoes colapsaveis

**Conteudo:**
```text
- Tipo de captura (icone + label)
- Data de captura
- Tamanho do ficheiro
- Dimensoes (se imagem)
- Localizacao completa
- Autor com avatar
- Notas (se existirem)
- Coordenadas GPS (se disponiveis)
```

---

## Accoes a Implementar

### 1. Download
- Obter signed URL do Storage
- Criar link temporario e trigger download
- Feedback com toast

### 2. Eliminar
- Confirmacao com AlertDialog
- Eliminar do Storage
- Eliminar registo da BD
- Fechar viewer e refrescar lista
- Feedback com toast

### 3. Criar Nao-Conformidade (NC)
- Abrir modal/sheet com formulario
- Campos: titulo, descricao, severidade
- Associar capture como evidencia
- Guardar em tabela nonconformities
- Requer inspection_id - pode ser opcional ou criar "avulsa"

---

## Gestao de Zoom

### Zoom com Scroll (Desktop)
```text
onWheel(e):
  - e.preventDefault()
  - deltaY < 0 → zoom in
  - deltaY > 0 → zoom out
  - Calcular novo zoom com limites
  - Actualizar posicao para zoom centrado no cursor
```

### Zoom com Pinch (Touch)
```text
onTouchStart:
  - Se 2 dedos, guardar distancia inicial

onTouchMove:
  - Se 2 dedos, calcular nova distancia
  - Ratio = novaDistancia / distanciaInicial
  - Aplicar ao zoom

onTouchEnd:
  - Reset estado de pinch
```

### Pan/Arrastar
```text
onMouseDown / onTouchStart (1 dedo):
  - isPanning = true
  - Guardar posicao inicial

onMouseMove / onTouchMove:
  - Se isPanning, calcular delta
  - Actualizar position { x, y }

onMouseUp / onTouchEnd:
  - isPanning = false
```

---

## Keyboard Shortcuts

```text
ESC        → Fechar viewer
ArrowLeft  → Captura anterior
ArrowRight → Proxima captura
+/=        → Zoom in
-          → Zoom out
0          → Reset zoom
I          → Toggle info panel
D          → Download (se implementado)
Delete     → Eliminar (com confirmacao)
```

---

## Dependencia Externa

**Photo Sphere Viewer** para visualizacao 360:
```text
npm install @photo-sphere-viewer/core
```

Alternativa sem dependencias:
- Usar CSS 3D transforms
- Mais limitado mas zero deps

Recomendacao: Usar Photo Sphere Viewer pela qualidade e features.

---

## Traducoes a Adicionar

```text
captures.viewer.zoomIn: "Ampliar"
captures.viewer.zoomOut: "Reduzir"
captures.viewer.resetZoom: "Repor zoom"
captures.viewer.showInfo: "Mostrar informacoes"
captures.viewer.hideInfo: "Esconder informacoes"
captures.viewer.deleteCapture: "Eliminar captura"
captures.viewer.deleteConfirm: "Tem a certeza que deseja eliminar esta captura?"
captures.viewer.deleteSuccess: "Captura eliminada com sucesso"
captures.viewer.createNC: "Criar Nao-Conformidade"
captures.viewer.downloadStarted: "Download iniciado"
captures.viewer.fileSize: "Tamanho"
captures.viewer.dimensions: "Dimensoes"
captures.viewer.gpsCoordinates: "Coordenadas GPS"
captures.viewer.captureNotes: "Notas"
captures.viewer.noNotes: "Sem notas"
```

---

## Ficheiros a Criar/Modificar

| Ficheiro | Accao |
|----------|-------|
| src/components/captures/CaptureViewer.tsx | Reescrever completamente |
| src/components/captures/ImageViewerWithZoom.tsx | Criar |
| src/components/captures/PanoramaViewer.tsx | Criar |
| src/components/captures/CaptureInfoPanel.tsx | Criar |
| src/components/captures/CreateNCModal.tsx | Criar |
| src/types/captures.ts | Adicionar tipos para zoom |
| src/i18n/locales/en.json | Adicionar chaves viewer |
| src/i18n/locales/pt.json | Adicionar chaves viewer |
| package.json | Adicionar @photo-sphere-viewer/core |

---

## Consideracoes Tecnicas

1. **Storage URLs**: O bucket "captures" e privado. Precisamos gerar signed URLs para exibir e download. Ate estar implementado, usar placeholder.

2. **Performance**: Carregar imagens grandes pode ser lento. Considerar:
   - Loading state com skeleton
   - Progressive loading se possivel

3. **Touch Events**: Prevenir scroll da pagina durante pinch/pan no mobile.

4. **Accessibility**: 
   - Focus trap dentro do dialog
   - aria-labels nos botoes
   - Keyboard navigation

5. **Memoria**: Limpar event listeners no cleanup do useEffect.

6. **NC sem Inspection**: A tabela nonconformities requer inspection_id. Opcoes:
   - Criar modal que pede para selecionar inspection
   - Ou criar inspection "avulsa" automaticamente
   - Ou tornar optional no futuro (alteracao BD)

---

## Fluxo de Utilizacao

```text
1. User clica numa captura na grid
   ↓
2. CaptureViewer abre em fullscreen
   ↓
3. User pode:
   a. Navegar entre capturas (setas/teclado)
   b. Zoom in/out (scroll/pinch/botoes)
   c. Pan para ver detalhes (arrastar)
   d. Ver painel de info (toggle)
   e. Download do ficheiro
   f. Eliminar captura
   g. Criar NC a partir da captura
   ↓
4. Se 360, viewer panoramico permite rotacao livre
   ↓
5. ESC ou X fecha o viewer
```

---

## Proximos Passos Apos Implementacao

1. Criar Edge Function para signed URLs do Storage
2. Implementar integracao real com Storage para download
3. Adicionar annotations/marcacoes sobre as imagens
4. Implementar comparacao side-by-side de capturas
5. Adicionar timeline de capturas do mesmo ponto
