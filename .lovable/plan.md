
# Plano: Sistema de Templates de Checklist para Inspecoes

## Resumo
Criar um sistema completo de gestao de templates de checklist para inspeccoes, acessivel atraves das Definicoes, com editor visual, drag-and-drop para reordenar itens, e 3 templates padrao pre-configurados.

---

## Arquitectura do Sistema

```text
Settings (links para sub-paginas)
└── InspectionTemplates.tsx
    ├── Lista de Templates
    │   ├── Nome
    │   ├── Categoria
    │   ├── Nº de Itens
    │   └── Ultima Utilizacao
    │
    └── Template Editor (Modal/Drawer)
        ├── Nome do Template
        ├── Categoria (Select)
        └── Lista de Itens (Drag-and-drop)
            ├── Texto da verificacao
            ├── Tipo (checkbox/texto/numero)
            └── Obrigatorio (sim/nao)
```

---

## Alteracoes de Base de Dados

### Migracao: Adicionar colunas necessarias

A tabela `inspection_templates` ja existe mas precisa de:
- `category` (text) - Categoria do template

A tabela `inspection_template_items` ja existe mas precisa de:
- `item_type` (text) - Tipo de item: checkbox, text, number
- `is_required` (boolean) - Se o item e obrigatorio
- `order_index` (integer) - Ordem do item na lista

```sql
-- Adicionar categoria aos templates
ALTER TABLE inspection_templates 
ADD COLUMN IF NOT EXISTS category text DEFAULT 'structure';

-- Adicionar campos aos itens
ALTER TABLE inspection_template_items 
ADD COLUMN IF NOT EXISTS item_type text DEFAULT 'checkbox',
ADD COLUMN IF NOT EXISTS is_required boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS order_index integer DEFAULT 0;

-- Inserir 3 templates padrao
INSERT INTO inspection_templates (id, name, org_id, category, version) VALUES
('00000000-0000-0000-0000-000000000001', 'Pre-Betonagem Laje', 
 (SELECT org_id FROM memberships LIMIT 1), 'structure', 1),
('00000000-0000-0000-0000-000000000002', 'Pre-Betonagem Pilar',
 (SELECT org_id FROM memberships LIMIT 1), 'structure', 1),
('00000000-0000-0000-0000-000000000003', 'Rececao de Betao',
 (SELECT org_id FROM memberships LIMIT 1), 'structure', 1);

-- Itens para Pre-Betonagem Laje
INSERT INTO inspection_template_items (template_id, item_code, title, item_type, is_required, order_index) VALUES
('00000000-0000-0000-0000-000000000001', 'PBL-01', 'Cofragem limpa e isenta de residuos', 'checkbox', true, 0),
('00000000-0000-0000-0000-000000000001', 'PBL-02', 'Armaduras posicionadas conforme projeto', 'checkbox', true, 1),
('00000000-0000-0000-0000-000000000001', 'PBL-03', 'Espaçadores colocados', 'checkbox', true, 2),
('00000000-0000-0000-0000-000000000001', 'PBL-04', 'Negativos marcados', 'checkbox', true, 3),
('00000000-0000-0000-0000-000000000001', 'PBL-05', 'Instalacoes electricas embebidas', 'checkbox', false, 4),
('00000000-0000-0000-0000-000000000001', 'PBL-06', 'Instalacoes hidraulicas embebidas', 'checkbox', false, 5),
('00000000-0000-0000-0000-000000000001', 'PBL-07', 'Observacoes', 'text', false, 6);

-- Itens para Pre-Betonagem Pilar
INSERT INTO inspection_template_items (template_id, item_code, title, item_type, is_required, order_index) VALUES
('00000000-0000-0000-0000-000000000002', 'PBP-01', 'Cofragem alinhada e aprumada', 'checkbox', true, 0),
('00000000-0000-0000-0000-000000000002', 'PBP-02', 'Armaduras conforme projeto', 'checkbox', true, 1),
('00000000-0000-0000-0000-000000000002', 'PBP-03', 'Estribos espaçados corretamente', 'checkbox', true, 2),
('00000000-0000-0000-0000-000000000002', 'PBP-04', 'Recobrimento verificado', 'checkbox', true, 3),
('00000000-0000-0000-0000-000000000002', 'PBP-05', 'Arranques para laje/viga preparados', 'checkbox', true, 4),
('00000000-0000-0000-0000-000000000002', 'PBP-06', 'Observacoes', 'text', false, 5);

-- Itens para Rececao de Betao
INSERT INTO inspection_template_items (template_id, item_code, title, item_type, is_required, order_index) VALUES
('00000000-0000-0000-0000-000000000003', 'RB-01', 'Guia de remessa conforme', 'checkbox', true, 0),
('00000000-0000-0000-0000-000000000003', 'RB-02', 'Classe de betao', 'text', true, 1),
('00000000-0000-0000-0000-000000000003', 'RB-03', 'Slump (mm)', 'number', true, 2),
('00000000-0000-0000-0000-000000000003', 'RB-04', 'Hora de saida da central', 'text', true, 3),
('00000000-0000-0000-0000-000000000003', 'RB-05', 'Hora de chegada a obra', 'text', true, 4),
('00000000-0000-0000-0000-000000000003', 'RB-06', 'Provetes recolhidos', 'checkbox', false, 5),
('00000000-0000-0000-0000-000000000003', 'RB-07', 'Numero de provetes', 'number', false, 6),
('00000000-0000-0000-0000-000000000003', 'RB-08', 'Observacoes', 'text', false, 7);
```

---

## Ficheiros a Criar/Modificar

| Ficheiro | Accao |
|----------|-------|
| src/pages/app/InspectionTemplates.tsx | Criar |
| src/components/templates/TemplateEditor.tsx | Criar |
| src/components/templates/TemplateItemEditor.tsx | Criar |
| src/components/templates/TemplateCard.tsx | Criar |
| src/pages/app/Settings.tsx | Modificar (adicionar link) |
| src/App.tsx | Adicionar rota |
| src/i18n/locales/pt.json | Adicionar chaves |
| src/i18n/locales/en.json | Adicionar chaves |

---

## Componentes Detalhados

### 1. InspectionTemplates.tsx (Pagina Principal)

**Layout:**
```text
<div className="space-y-6">
  <Header>
    <h1>Templates de Inspecao</h1>
    <Button>+ Novo Template</Button>
  </Header>
  
  <Grid>
    {templates.map(t => <TemplateCard template={t} />)}
  </Grid>
  
  <TemplateEditor open={...} />
</div>
```

**Queries:**
- Lista de templates da organizacao do utilizador
- Contagem de itens por template
- Ultima utilizacao (COUNT inspections WHERE template_id)

### 2. TemplateCard.tsx

**Informacoes exibidas:**
- Nome do template
- Badge de categoria (cor diferente por categoria)
- Numero de itens
- Ultima utilizacao (data ou "Nunca utilizado")

**Accoes:**
- Editar (abre editor)
- Duplicar
- Eliminar (com confirmacao)

### 3. TemplateEditor.tsx (Sheet/Dialog Grande)

**Estrutura:**
```text
<Sheet side="right" className="w-[600px]">
  <Header>
    <Input value={name} placeholder="Nome do template" />
  </Header>
  
  <Content>
    <Select value={category}>
      <Option value="structure">Estrutura</Option>
      <Option value="finishes">Acabamentos</Option>
      <Option value="installations">Instalacoes</Option>
      <Option value="safety">Seguranca</Option>
    </Select>
    
    <Separator />
    
    <div className="flex justify-between">
      <h3>Itens do Checklist</h3>
      <Button>+ Adicionar Item</Button>
    </div>
    
    <DraggableList>
      {items.map(item => (
        <TemplateItemEditor 
          item={item}
          onUpdate={...}
          onRemove={...}
        />
      ))}
    </DraggableList>
  </Content>
  
  <Footer>
    <Button variant="outline">Cancelar</Button>
    <Button>Guardar Template</Button>
  </Footer>
</Sheet>
```

### 4. TemplateItemEditor.tsx

**Cada item do checklist:**
```text
<div className="flex items-center gap-3 p-3 border rounded-lg">
  <GripVertical className="cursor-grab" /> // Para drag
  
  <Input 
    value={item.title} 
    placeholder="Texto da verificacao" 
    className="flex-1"
  />
  
  <Select value={item.item_type}>
    <Option value="checkbox">Checkbox</Option>
    <Option value="text">Texto</Option>
    <Option value="number">Numero</Option>
  </Select>
  
  <Checkbox 
    checked={item.is_required} 
    label="Obrigatorio"
  />
  
  <Button variant="ghost" size="icon" onClick={onRemove}>
    <Trash2 />
  </Button>
</div>
```

### 5. Modificar Settings.tsx

Adicionar card/link para Templates:
```text
<Card className="cursor-pointer hover:border-primary/50">
  <CardHeader>
    <ClipboardList className="text-primary" />
    <CardTitle>Templates de Inspecao</CardTitle>
    <CardDescription>Gerir checklists padrao</CardDescription>
  </CardHeader>
</Card>
```

---

## Drag-and-Drop para Itens

Reutilizar o padrao ja implementado em SiteStructureTab.tsx:

```text
const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

const handleDragStart = (e: DragEvent, itemId: string) => {
  setDraggedItemId(itemId);
  e.dataTransfer.effectAllowed = 'move';
};

const handleDrop = (e: DragEvent, targetItemId: string) => {
  // Reordenar items
  // Actualizar order_index de todos os itens afectados
};
```

---

## Traducoes a Adicionar

```text
templates.title: "Templates de Inspecao"
templates.subtitle: "Gerir checklists padrao para fiscalizacoes"
templates.new: "Novo Template"
templates.edit: "Editar Template"
templates.name: "Nome do Template"
templates.namePlaceholder: "Ex: Pre-Betonagem Laje"
templates.category: "Categoria"
templates.categories.structure: "Estrutura"
templates.categories.finishes: "Acabamentos"
templates.categories.installations: "Instalacoes"
templates.categories.safety: "Seguranca"
templates.items: "Itens"
templates.addItem: "Adicionar Item"
templates.itemText: "Texto da verificacao"
templates.itemType: "Tipo"
templates.itemTypes.checkbox: "Checkbox"
templates.itemTypes.text: "Texto"
templates.itemTypes.number: "Numero"
templates.required: "Obrigatorio"
templates.lastUsed: "Ultima utilizacao"
templates.neverUsed: "Nunca utilizado"
templates.noTemplates: "Ainda nao existem templates"
templates.createFirst: "Crie o seu primeiro template de inspeccao"
templates.created: "Template criado com sucesso"
templates.updated: "Template atualizado com sucesso"
templates.deleted: "Template eliminado com sucesso"
templates.duplicate: "Duplicar"
templates.deleteConfirm: "Tem a certeza que deseja eliminar o template \"{{name}}\"?"
templates.dragToReorder: "Arraste para reordenar os itens"
```

---

## Rota

Adicionar em App.tsx:
```text
<Route path="settings/templates" element={<InspectionTemplates />} />
```

---

## Fluxo de Utilizacao

```text
1. User vai a Definicoes
   ↓
2. Clica em "Templates de Inspecao"
   ↓
3. Ve lista de templates (incluindo os 3 padrao)
   ↓
4. Clica em "+ Novo Template" ou edita existente
   ↓
5. Editor abre com:
   - Campo nome
   - Dropdown categoria
   - Lista de itens arrastavel
   ↓
6. Adiciona/remove/reordena itens
   ↓
7. Guarda template
```

---

## Categorias e Cores

| Categoria | Codigo | Cor Badge |
|-----------|--------|-----------|
| Estrutura | structure | blue |
| Acabamentos | finishes | amber |
| Instalacoes | installations | green |
| Seguranca | safety | red |

---

## Consideracoes Tecnicas

1. **RLS**: Templates filtrados por org_id do utilizador (ja existe policy)

2. **Templates Padrao**: Inseridos via migracao para a primeira organizacao do utilizador. Alternativa: seeding manual ou criar quando nao existem templates.

3. **Validacao**: Nome obrigatorio, pelo menos 1 item

4. **Performance**: Usar React Query com optimistic updates para reordenacao

5. **Duplicar Template**: Criar copia com nome + " (Copia)" e duplicar todos os itens

6. **Ultima Utilizacao**: Query que conta inspeccoes por template_id e retorna MAX(created_at)

---

## Templates Padrao Detalhados

### Pre-Betonagem Laje
- Cofragem limpa e isenta de residuos (checkbox, obrigatorio)
- Armaduras posicionadas conforme projeto (checkbox, obrigatorio)
- Espacadores colocados (checkbox, obrigatorio)
- Negativos marcados (checkbox, obrigatorio)
- Instalacoes electricas embebidas (checkbox)
- Instalacoes hidraulicas embebidas (checkbox)
- Observacoes (texto)

### Pre-Betonagem Pilar
- Cofragem alinhada e aprumada (checkbox, obrigatorio)
- Armaduras conforme projeto (checkbox, obrigatorio)
- Estribos espacados corretamente (checkbox, obrigatorio)
- Recobrimento verificado (checkbox, obrigatorio)
- Arranques para laje/viga preparados (checkbox, obrigatorio)
- Observacoes (texto)

### Rececao de Betao
- Guia de remessa conforme (checkbox, obrigatorio)
- Classe de betao (texto, obrigatorio)
- Slump em mm (numero, obrigatorio)
- Hora de saida da central (texto, obrigatorio)
- Hora de chegada a obra (texto, obrigatorio)
- Provetes recolhidos (checkbox)
- Numero de provetes (numero)
- Observacoes (texto)
