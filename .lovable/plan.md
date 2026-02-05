
# Plano: Pagina de Preenchimento de Inspeccao (InspectionDetail.tsx)

## Resumo
Reescrever a pagina `InspectionDetail.tsx` para permitir o preenchimento completo de uma inspeccao, incluindo marcacao de conformidade por item, observacoes, anexos de fotos, e criacao automatica de nao-conformidades quando um item e marcado como "Nao Conforme".

---

## Analise do Estado Actual

### Tabelas Existentes:
- **inspections**: Dados da inspeccao (site, template, status, etc.)
- **inspection_items**: Resultados por item (result: OK/NC/OBS/NA, notes, severity)
- **inspection_template_items**: Itens do template (title, item_type, is_required)
- **nonconformities**: Nao-conformidades (inspection_id, inspection_item_id, title, severity, status)
- **evidence_links**: Ligacao entre capturas e inspeccoes (capture_id, inspection_id, kind)

### Enums Relevantes:
- `inspection_result`: OK, NC, OBS, NA
- `nonconformity_status`: OPEN, IN_PROGRESS, RESOLVED, CLOSED

### Pagina Actual:
- Mostra informacoes basicas da inspeccao
- Lista itens do template (apenas visualizacao)
- Botoes placeholder sem funcionalidade

---

## Arquitectura da Solucao

```text
InspectionDetail.tsx
├── Header Fixo
│   ├── Botao Voltar
│   ├── Nome do Template
│   ├── Badges (Categoria, Estado)
│   └── Nome da Obra
│
├── Cards de Info
│   ├── Data
│   ├── Localizacao
│   ├── Inspector
│   └── Progresso (X/Y itens)
│
├── Secçao Checklist
│   └── ChecklistItem (por cada item)
│       ├── Numero + Titulo
│       ├── Radio/Botoes: OK | NC | OBS | NA
│       ├── Campo Observacoes (expandivel)
│       ├── Botao Anexar Foto (abre modal upload)
│       └── Badge Obrigatorio (se aplicavel)
│
├── Secçao Fotos Gerais
│   ├── DropZone para upload multiplo
│   └── Grid de fotos anexadas
│
├── Modal Criar NC (quando NC selecionado)
│   ├── Titulo (pre-preenchido com item)
│   ├── Descricao
│   ├── Gravidade
│   └── Accao Corretiva
│
└── Barra de Accoes (sticky bottom)
    ├── Guardar Rascunho
    └── Concluir Inspeccao
```

---

## Ficheiros a Criar/Modificar

| Ficheiro | Accao |
|----------|-------|
| src/pages/app/InspectionDetail.tsx | Reescrever completamente |
| src/components/inspections/ChecklistItem.tsx | Criar |
| src/components/inspections/CreateNCFromItem.tsx | Criar |
| src/components/inspections/InspectionPhotos.tsx | Criar |
| src/components/inspections/PhotoUploadModal.tsx | Criar |
| src/i18n/locales/pt.json | Adicionar chaves |
| src/i18n/locales/en.json | Adicionar chaves |

---

## Fluxo de Dados

### 1. Inicializacao:
```text
1. Carregar inspeccao com joins (site, template, floors, areas, points)
2. Carregar template_items ordenados por order_index
3. Carregar inspection_items existentes (pode estar vazio se primeira vez)
4. Carregar evidence_links para fotos anexadas
5. Criar mapa local: templateItemId -> resultado + notas
```

### 2. Criar Inspection Items (se nao existirem):
```text
Quando a inspeccao e aberta pela primeira vez:
- Para cada template_item, verificar se existe inspection_item
- Se nao existir, criar com result = null
- Isto permite guardar progresso parcial
```

### 3. Actualizar Item:
```text
Quando o utilizador muda o resultado de um item:
1. UPDATE inspection_items SET result = 'OK'/'NC'/'OBS'/'NA', notes = '...'
2. Se result = 'NC' → Abrir modal para criar NC
3. Actualizar estado local imediatamente (optimistic update)
```

### 4. Anexar Foto a Item:
```text
1. Abrir modal de upload
2. Upload para Storage (bucket captures ou novo bucket inspection_evidence)
3. Criar registo em evidence_links com kind = 'item_evidence' e inspection_item_id
4. Mostrar thumbnail no item
```

### 5. Fotos Gerais:
```text
1. Upload multiplo via DropZone
2. Criar registo em evidence_links com kind = 'general'
3. Mostrar grid de fotos
```

### 6. Guardar Rascunho:
```text
1. Guardar todos os inspection_items com resultados actuais
2. UPDATE inspections SET status = 'IN_PROGRESS'
3. Toast de sucesso
```

### 7. Concluir Inspeccao:
```text
1. Validar: todos os itens obrigatorios tem resultado
2. Validar: itens que requerem evidencia tem fotos anexadas
3. UPDATE inspections SET status = 'COMPLETED'
4. Bloquear edicao (modo read-only)
5. Redirigir ou mostrar resumo
```

---

## Componente ChecklistItem.tsx

```text
interface ChecklistItemProps {
  templateItem: TemplateItem;
  inspectionItem: InspectionItem | null;
  onResultChange: (itemId: string, result: InspectionResult, notes: string) => void;
  onAddPhoto: (itemId: string) => void;
  photos: EvidenceLink[];
  isReadOnly: boolean;
}

Estrutura Visual:
┌─────────────────────────────────────────────────────────────────┐
│  [1]  Cofragem limpa e isenta de residuos         [Obrigatorio] │
│                                                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                           │
│  │  OK  │ │  NC  │ │ OBS  │ │ N/A  │                           │
│  └──────┘ └──────┘ └──────┘ └──────┘                           │
│                                                                  │
│  Observacoes: ____________________________________________      │
│                                                                  │
│  Fotos: [+] [📷] [📷]                                          │
└─────────────────────────────────────────────────────────────────┘
```

Comportamento dos botoes de resultado:
- **OK** (verde): Conforme
- **NC** (vermelho): Nao Conforme → Abre modal NC
- **OBS** (amarelo): Observacao (conforme com nota)
- **NA** (cinza): Nao Aplicavel

---

## Modal Criar NC (CreateNCFromItem.tsx)

```text
Quando o utilizador marca um item como NC:
1. Modal abre automaticamente
2. Titulo pre-preenchido: "NC - [titulo do item]"
3. Campos:
   - Titulo (editavel)
   - Descricao (textarea)
   - Gravidade: Baixa / Media / Alta / Critica
   - Accao Corretiva (opcional)
   - Responsavel (opcional)
   - Data Limite (opcional)
4. Guardar cria registo em nonconformities
5. Fechar modal, item fica marcado como NC
```

---

## Secçao Fotos Gerais (InspectionPhotos.tsx)

```text
┌─────────────────────────────────────────────────────────────────┐
│  Fotos Gerais da Inspeccao                          [+ Anexar]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                  │
│  │ 📷   │ │ 📷   │ │ 📷   │ │ 📷   │ │  +   │                  │
│  │      │ │      │ │      │ │      │ │      │                  │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

- Reutilizar DropZone existente
- Upload vai para Storage
- Criar evidence_link com inspection_id

---

## Barra de Accoes

```text
Inspeccao em DRAFT ou IN_PROGRESS:
┌─────────────────────────────────────────────────────────────────┐
│                   [Guardar Rascunho]  [Concluir Inspeccao]     │
└─────────────────────────────────────────────────────────────────┘

Inspeccao COMPLETED:
- Botoes desabilitados ou escondidos
- Badge "Inspeccao Concluida" visivel
- Todos os campos em modo read-only
```

---

## Validacao ao Concluir

```text
Verificar antes de permitir conclusao:

1. Itens obrigatorios (is_required = true) devem ter resultado != null
2. Itens com requires_evidence = true devem ter pelo menos 1 foto
3. Se alguma validacao falhar:
   - Mostrar toast com lista de erros
   - Highlight nos itens com problema
   - Nao permitir conclusao
```

---

## Traducoes a Adicionar

```text
inspections.detail.progress: "Progresso"
inspections.detail.itemsCompleted: "{{completed}} de {{total}} itens"
inspections.detail.generalPhotos: "Fotos Gerais"
inspections.detail.attachPhoto: "Anexar Foto"
inspections.detail.addPhotos: "Adicionar Fotos"
inspections.detail.resultOK: "Conforme"
inspections.detail.resultNC: "Não Conforme"
inspections.detail.resultOBS: "Observação"
inspections.detail.resultNA: "N/A"
inspections.detail.observations: "Observações"
inspections.detail.observationsPlaceholder: "Adicionar observações..."
inspections.detail.saveDraft: "Guardar Rascunho"
inspections.detail.completeInspection: "Concluir Inspeção"
inspections.detail.savedSuccessfully: "Alterações guardadas"
inspections.detail.completedSuccessfully: "Inspeção concluída com sucesso"
inspections.detail.readOnly: "Esta inspeção já foi concluída e não pode ser editada"
inspections.detail.missingRequired: "Existem itens obrigatórios por preencher"
inspections.detail.missingEvidence: "Existem itens que necessitam de evidência fotográfica"
inspections.detail.createNC: "Criar Não-Conformidade"
inspections.detail.ncTitle: "Título da NC"
inspections.detail.ncDescription: "Descrição"
inspections.detail.ncSeverity: "Gravidade"
inspections.detail.ncCorrectiveAction: "Ação Corretiva"
inspections.detail.ncResponsible: "Responsável"
inspections.detail.ncDueDate: "Data Limite"
inspections.detail.ncCreated: "Não-conformidade registada"
inspections.detail.photoUploaded: "Foto anexada com sucesso"
inspections.detail.noPhotos: "Sem fotos anexadas"
```

---

## Migracao de Base de Dados (se necessario)

A tabela `evidence_links` ja existe mas pode precisar de campo adicional para referenciar `inspection_item_id`:

```sql
-- Adicionar referencia ao item especifico (opcional, para fotos por item)
ALTER TABLE evidence_links
ADD COLUMN IF NOT EXISTS inspection_item_id uuid REFERENCES inspection_items(id);

-- Adicionar tipo de evidencia
-- O campo 'kind' ja existe e pode ser usado: 'general', 'item_evidence'
```

---

## Estado Local da Pagina

```text
interface InspectionDetailState {
  // Dados carregados
  inspection: Inspection;
  templateItems: TemplateItem[];
  
  // Estado de preenchimento
  itemResults: Map<string, {
    inspectionItemId: string;
    result: 'OK' | 'NC' | 'OBS' | 'NA' | null;
    notes: string;
  }>;
  
  // Fotos
  itemPhotos: Map<string, EvidenceLink[]>;
  generalPhotos: EvidenceLink[];
  
  // UI
  isSubmitting: boolean;
  showNCModal: boolean;
  currentNCItem: TemplateItem | null;
  showPhotoModal: boolean;
  currentPhotoItem: TemplateItem | null;
}
```

---

## Fluxo de Utilizacao

```text
1. Utilizador abre inspeccao (/app/inspections/:id)
   ↓
2. Sistema carrega dados e cria inspection_items se necessario
   ↓
3. Utilizador percorre checklist:
   - Marca cada item como OK, NC, OBS ou NA
   - Adiciona observacoes quando necessario
   - Anexa fotos por item ou gerais
   ↓
4. Se marca NC:
   - Modal abre para criar nao-conformidade
   - Preenche detalhes e guarda
   ↓
5. Clica "Guardar Rascunho" periodicamente
   - Estado = IN_PROGRESS
   ↓
6. Quando termina, clica "Concluir Inspeccao"
   - Validacao de itens obrigatorios
   - Estado = COMPLETED
   - Pagina fica read-only
```

---

## Consideracoes Tecnicas

1. **Auto-save**: Implementar debounce para guardar automaticamente a cada 30 segundos

2. **Optimistic Updates**: Actualizar UI imediatamente, fazer sync em background

3. **Offline Support (futuro)**: Estrutura preparada para guardar localmente

4. **Performance**: Usar React Query para cache dos dados

5. **RLS**: Policies ja existem para inspection_items e nonconformities

6. **Storage**: Usar bucket "captures" existente ou criar "inspection-evidence"

---

## Resumo das Alteracoes

1. **InspectionDetail.tsx**: Reescrita completa com funcionalidade de preenchimento
2. **ChecklistItem.tsx**: Componente para cada item do checklist
3. **CreateNCFromItem.tsx**: Modal para criar NC quando item marcado como NC
4. **InspectionPhotos.tsx**: Componente para fotos gerais
5. **PhotoUploadModal.tsx**: Modal para upload de foto por item
6. **Migracao BD**: Adicionar `inspection_item_id` a `evidence_links`
7. **Traducoes**: Novas chaves em PT e EN
