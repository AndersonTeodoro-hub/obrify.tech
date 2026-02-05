
# Plano: Pagina SiteDetail.tsx

## Resumo
Criar uma pagina de detalhe de obra com header informativo, sistema de tabs completo, gestao hierarquica da estrutura (Pisos > Areas > Pontos de Captura) e integracao com capturas, inspeccoes e documentos.

---

## Arquitectura da Pagina

```text
SiteDetail.tsx
├── Header
│   ├── Breadcrumb (Dashboard > Obras > [Nome])
│   ├── Nome da obra + Badge de estado
│   ├── Morada
│   └── Botao Editar
│
├── Tabs
│   ├── Visao Geral (estatisticas e resumo)
│   ├── Estrutura (arvore hierarquica)
│   ├── Capturas (grid filtrado por esta obra)
│   ├── Inspeccoes (lista de fiscalizacoes)
│   └── Documentos (lista de documentos)
```

---

## Ficheiros a Criar/Modificar

| Ficheiro | Accao |
|----------|-------|
| src/pages/app/SiteDetail.tsx | Criar |
| src/components/sites/SiteHeader.tsx | Criar |
| src/components/sites/SiteOverviewTab.tsx | Criar |
| src/components/sites/SiteStructureTab.tsx | Criar |
| src/components/sites/SiteCapturesTab.tsx | Criar |
| src/components/sites/SiteInspectionsTab.tsx | Criar |
| src/components/sites/SiteDocumentsTab.tsx | Criar |
| src/components/sites/EditSiteModal.tsx | Criar |
| src/components/sites/AddFloorModal.tsx | Criar |
| src/components/sites/AddAreaModal.tsx | Criar |
| src/components/sites/AddPointModal.tsx | Criar |
| src/App.tsx | Adicionar rota /sites/:siteId |
| src/components/layout/AppHeader.tsx | Actualizar breadcrumb para mostrar nome da obra |
| src/i18n/locales/en.json | Adicionar chaves |
| src/i18n/locales/pt.json | Adicionar chaves |

---

## Componentes Detalhados

### 1. SiteDetail.tsx (Pagina Principal)

**Props via useParams:**
- siteId: string

**Estado:**
- activeTab: string ('overview' | 'structure' | 'captures' | 'inspections' | 'documents')
- isEditOpen: boolean

**Queries React Query:**
1. Site com dados da organizacao
2. Floors com contagem de areas
3. Areas com contagem de pontos
4. Capture points
5. Estatisticas (total capturas, NCs abertas, ultima inspeccao)

**Layout:**
```text
<div className="space-y-6">
  <SiteHeader site={site} onEdit={() => setIsEditOpen(true)} />
  
  <Tabs value={activeTab} onValueChange={setActiveTab}>
    <TabsList>
      <TabsTrigger value="overview">Visao Geral</TabsTrigger>
      <TabsTrigger value="structure">Estrutura</TabsTrigger>
      <TabsTrigger value="captures">Capturas</TabsTrigger>
      <TabsTrigger value="inspections">Inspeccoes</TabsTrigger>
      <TabsTrigger value="documents">Documentos</TabsTrigger>
    </TabsList>
    
    <TabsContent value="overview">
      <SiteOverviewTab siteId={siteId} />
    </TabsContent>
    ...
  </Tabs>
  
  <EditSiteModal open={isEditOpen} ... />
</div>
```

### 2. SiteHeader.tsx

**Props:**
- site: Site (com organizacao)
- onEdit: () => void

**Conteudo:**
- Nome da obra em h1
- Badge colorido com estado (Ativa/Pausada/Concluida)
- Morada com icone MapPin
- Nome da organizacao
- Botao "Editar" no canto direito

**Badge de Estado:**
```text
- active: bg-green-500 (Ativa)
- paused: bg-yellow-500 (Pausada)
- completed: bg-blue-500 (Concluida)
```

### 3. SiteOverviewTab.tsx

**Cards de Estatisticas:**
1. Total de Capturas (icone Camera)
2. NCs Abertas (icone AlertTriangle, vermelho se > 0)
3. Inspeccoes Realizadas (icone ClipboardCheck)
4. Ultima Inspeccao (icone Calendar)

**Cards Adicionais:**
- Resumo da Estrutura: X Pisos, Y Areas, Z Pontos
- Actividade Recente: ultimas 5 capturas/inspeccoes

**Queries:**
```text
- COUNT captures via capture_points > areas > floors > site
- COUNT nonconformities WHERE status = 'OPEN' via inspections > site
- COUNT inspections WHERE site_id = :siteId
- MAX(scheduled_at) FROM inspections WHERE site_id = :siteId
```

### 4. SiteStructureTab.tsx

**Arvore Hierarquica usando Accordion:**
```text
Piso -1 (Garagem)
  ├── Zona A
  │   ├── Ponto P-001
  │   └── Ponto P-002
  └── Zona B
      └── Ponto P-003

Piso 0 (Rez-do-chao)
  └── Entrada
      └── Ponto P-004
```

**Componentes utilizados:**
- Accordion para pisos (nivel 1)
- Accordion aninhado para areas (nivel 2)
- Lista simples para pontos (nivel 3)

**Accoes por nivel:**
- Piso: Editar, Eliminar, Adicionar Area
- Area: Editar, Eliminar, Adicionar Ponto
- Ponto: Editar, Eliminar

**Botoes no topo:**
- "Adicionar Piso"

**Estado vazio:**
- Mensagem "Ainda nao tem pisos configurados"
- Botao "Adicionar Primeiro Piso"

### 5. SiteCapturesTab.tsx

**Reutilizar logica de Captures.tsx:**
- Filtrar automaticamente pelo siteId
- Grid de CaptureCard
- Abrir CaptureViewer ao clicar
- Botao "Nova Captura" que abre modal pre-preenchido com site

### 6. SiteInspectionsTab.tsx

**Lista de Inspeccoes:**
- Tabela ou cards com:
  - Nome do template
  - Data agendada
  - Estado (badge)
  - Responsavel
  - Accoes (ver, editar)

**Estado vazio:**
- "Ainda nao existem inspeccoes para esta obra"
- Botao "Criar Inspeccao"

### 7. SiteDocumentsTab.tsx

**Lista de Documentos:**
- Tabela com:
  - Nome do documento
  - Tipo
  - Data de upload
  - Accoes (download, eliminar)

**Estado vazio:**
- "Ainda nao existem documentos"
- Botao "Carregar Documento"

### 8. EditSiteModal.tsx

**Campos editaveis:**
- Nome (obrigatorio)
- Morada
- Descricao
- Estado (select: active, paused, completed)

**Nota:** O campo 'status' nao existe actualmente na tabela sites. Sera necessario adicionar via migracao ou simular com logica de negocio.

---

## Alteracao na Rota (App.tsx)

Adicionar nova rota dentro do bloco /app:

```text
<Route path="sites/:siteId" element={<SiteDetail />} />
```

---

## Alteracao no AppHeader.tsx

Actualizar a logica de breadcrumbs para:
1. Detectar quando estamos em /app/sites/:siteId
2. Buscar o nome da obra via query ou context
3. Mostrar: Dashboard > Obras > [Nome da Obra]

**Alternativa mais simples:**
- Passar o nome da obra via state do router
- Ou usar um context de "current site"

---

## Migracao de Base de Dados

A tabela `sites` nao tem campo `status`. Opcoes:

**Opcao 1:** Adicionar coluna status
```text
ALTER TABLE sites 
ADD COLUMN status text NOT NULL DEFAULT 'active'
CHECK (status IN ('active', 'paused', 'completed'));
```

**Opcao 2:** Inferir estado de outras tabelas (ex: se tem inspeccao concluida recente = activa)

**Recomendacao:** Opcao 1 para flexibilidade total.

---

## Traducoes a Adicionar

```text
siteDetail.overview: "Visao Geral"
siteDetail.structure: "Estrutura"
siteDetail.captures: "Capturas"
siteDetail.inspections: "Inspeccoes"
siteDetail.documents: "Documentos"
siteDetail.editSite: "Editar Obra"
siteDetail.totalCaptures: "Total de Capturas"
siteDetail.openNCs: "NCs Abertas"
siteDetail.inspectionsCount: "Inspeccoes"
siteDetail.lastInspection: "Ultima Inspeccao"
siteDetail.noInspections: "Sem inspeccoes"
siteDetail.structureSummary: "Resumo da Estrutura"
siteDetail.floors: "Pisos"
siteDetail.areas: "Areas"
siteDetail.points: "Pontos"
siteDetail.addFloor: "Adicionar Piso"
siteDetail.addArea: "Adicionar Area"
siteDetail.addPoint: "Adicionar Ponto"
siteDetail.floorName: "Nome do Piso"
siteDetail.floorLevel: "Nivel"
siteDetail.areaName: "Nome da Area"
siteDetail.pointCode: "Codigo do Ponto"
siteDetail.pointDescription: "Descricao"
siteDetail.noFloors: "Ainda nao tem pisos configurados"
siteDetail.createFirstFloor: "Adicionar Primeiro Piso"
siteDetail.noDocuments: "Ainda nao existem documentos"
siteDetail.uploadDocument: "Carregar Documento"
siteDetail.recentActivity: "Actividade Recente"
```

---

## Fluxo de Utilizacao

```text
1. User clica numa obra na pagina Sites ou Dashboard
   ↓
2. Navega para /app/sites/:siteId
   ↓
3. SiteDetail carrega dados da obra
   ↓
4. User ve header com info basica
   ↓
5. Tab Visao Geral mostra estatisticas
   ↓
6. User pode:
   a. Editar info da obra (botao header)
   b. Ver/gerir estrutura (tab Estrutura)
   c. Ver capturas filtradas (tab Capturas)
   d. Ver inspeccoes (tab Inspeccoes)
   e. Ver documentos (tab Documentos)
```

---

## Consideracoes Tecnicas

1. **RLS Policies**: Todas as queries respeitam as policies existentes via `can_access_site` e `is_org_member`

2. **Performance**: Usar React Query com staleTime apropriado para evitar re-fetches excessivos

3. **Estado 404**: Se siteId nao existe ou user nao tem acesso, mostrar pagina de erro

4. **Navegacao**: Usar useNavigate para voltar a lista de obras

5. **Breadcrumb Dinamico**: Pode requerer pequena refactorizacao do AppHeader ou uso de React Context

---

## Proximos Passos Apos Implementacao

1. Adicionar mapa interactivo com localizacao da obra
2. Implementar upload de planta baixa (floor plan)
3. Adicionar marcadores de pontos de captura na planta
4. Integrar timeline de actividade
5. Dashboard comparativo entre obras

