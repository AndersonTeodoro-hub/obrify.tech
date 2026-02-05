
# Plano: Gestao Completa de Pisos, Areas e Pontos

## Resumo
Implementar gestao completa da estrutura hierarquica na tab Estrutura do SiteDetail, incluindo modais de edicao, confirmacao de eliminacao, campos adicionais (tipo de area, coordenadas de ponto) e drag-and-drop para reordenar pisos.

---

## Analise do Estado Actual

### O que ja existe:
- Arvore expansivel com Accordion (Pisos > Areas > Pontos)
- Modais basicos para adicionar Piso, Area e Ponto
- Mutations para eliminar (sem confirmacao)
- Botoes de editar que nao fazem nada

### O que falta implementar:
1. Campo **Descricao** no modal de Piso
2. Campo **Tipo** (dropdown) no modal de Area
3. Campos **Coordenadas X/Y** no modal de Ponto
4. Modais de **edicao** para os tres niveis
5. **Confirmacao** antes de eliminar
6. **Drag-and-drop** para reordenar pisos

---

## Alteracoes de Base de Dados

### Migracao 1: Adicionar coluna `description` a tabela floors
```sql
ALTER TABLE floors ADD COLUMN description text;
```

### Migracao 2: Adicionar coluna `type` a tabela areas
```sql
ALTER TABLE areas ADD COLUMN type text DEFAULT 'other';
```

Tipos disponiveis (validacao no frontend):
- `room` (Sala)
- `corridor` (Corredor)
- `bathroom` (WC)
- `kitchen` (Cozinha)
- `balcony` (Varanda)
- `other` (Outro)

---

## Componentes a Modificar/Criar

### 1. Modificar `AddFloorModal.tsx`
Adicionar campo Descricao (textarea opcional)

**Campos:**
- Nome (obrigatorio)
- Nivel/Ordem (numero)
- Descricao (opcional)

### 2. Modificar `AddAreaModal.tsx`
Adicionar dropdown de Tipo

**Campos:**
- Nome (obrigatorio)
- Tipo (select com opcoes traduzidas)

### 3. Modificar `AddPointModal.tsx`
Adicionar campos de coordenadas

**Campos:**
- Codigo (obrigatorio)
- Descricao (opcional)
- Posicao X (numero, opcional)
- Posicao Y (numero, opcional)

### 4. Criar `EditFloorModal.tsx`
Modal para editar piso existente

**Props:**
- floor: Floor object
- open, onOpenChange, onSuccess

**Logica:**
- Pre-preencher campos com dados actuais
- Mutation de UPDATE

### 5. Criar `EditAreaModal.tsx`
Modal para editar area existente

### 6. Criar `EditPointModal.tsx`
Modal para editar ponto existente

### 7. Criar `DeleteConfirmDialog.tsx`
Componente reutilizavel para confirmacao de eliminacao

**Props:**
- open, onOpenChange
- title, description
- onConfirm
- isPending (loading state)

### 8. Modificar `SiteStructureTab.tsx`

**Novas funcionalidades:**
1. Estado para modais de edicao
2. Estado para dialogo de confirmacao
3. Integracao com drag-and-drop (dnd-kit ou nativo HTML5)
4. Handler para reordenar pisos (actualizar campo `level`)

**Drag-and-drop:**
- Usar biblioteca `@dnd-kit/core` (ja pode instalar)
- Ou implementar com HTML5 Drag and Drop API (zero deps)
- Ao soltar, actualizar o campo `level` de todos os pisos afectados

---

## Estrutura do Drag-and-Drop

```text
Implementacao com HTML5 Drag API:
- onDragStart: guardar ID do piso a mover
- onDragOver: permitir drop, highlight visual
- onDragEnd: calcular nova ordem, batch update levels
```

**Mutation de reordenacao:**
```text
UPDATE floors SET level = X WHERE id = 'floor1';
UPDATE floors SET level = Y WHERE id = 'floor2';
...
```

---

## Traducoes a Adicionar

```text
siteDetail.floorDescription: "Descricao"
siteDetail.floorDescriptionPlaceholder: "Descricao opcional do piso"
siteDetail.floorUpdated: "Piso atualizado com sucesso"
siteDetail.editFloor: "Editar Piso"

siteDetail.areaType: "Tipo de Area"
siteDetail.areaTypes.room: "Sala"
siteDetail.areaTypes.corridor: "Corredor"
siteDetail.areaTypes.bathroom: "WC"
siteDetail.areaTypes.kitchen: "Cozinha"
siteDetail.areaTypes.balcony: "Varanda"
siteDetail.areaTypes.other: "Outro"
siteDetail.areaUpdated: "Area atualizada com sucesso"
siteDetail.editArea: "Editar Area"

siteDetail.pointPosX: "Posicao X"
siteDetail.pointPosY: "Posicao Y"
siteDetail.pointPosHint: "Coordenadas na planta baixa"
siteDetail.pointUpdated: "Ponto atualizado com sucesso"
siteDetail.editPoint: "Editar Ponto"

siteDetail.deleteConfirmTitle: "Confirmar Eliminacao"
siteDetail.deleteFloorConfirm: "Tem a certeza que deseja eliminar o piso \"{{name}}\"? Todas as areas e pontos serao eliminados."
siteDetail.deleteAreaConfirm: "Tem a certeza que deseja eliminar a area \"{{name}}\"? Todos os pontos serao eliminados."
siteDetail.deletePointConfirm: "Tem a certeza que deseja eliminar o ponto \"{{code}}\"?"
siteDetail.dragToReorder: "Arraste para reordenar"
```

---

## Fluxo de Utilizacao

### Adicionar Estrutura:
```text
1. Clicar "+ Piso" → Modal com nome, nivel, descricao
2. Expandir piso → Clicar "+ Area" → Modal com nome, tipo
3. Expandir area → Clicar "+ Ponto" → Modal com codigo, descricao, coords
```

### Editar:
```text
1. Menu (tres pontos) em qualquer item
2. Selecionar "Editar"
3. Modal pre-preenchido abre
4. Guardar alteracoes
```

### Eliminar:
```text
1. Menu (tres pontos) em qualquer item
2. Selecionar "Eliminar"
3. Dialog de confirmacao aparece
4. Confirmar → Item eliminado com toast
```

### Reordenar Pisos:
```text
1. Arrastar icone de grip no inicio do piso
2. Soltar na nova posicao
3. Niveis actualizados automaticamente
```

---

## Ficheiros a Criar/Modificar

| Ficheiro | Accao |
|----------|-------|
| src/components/sites/AddFloorModal.tsx | Modificar (adicionar descricao) |
| src/components/sites/AddAreaModal.tsx | Modificar (adicionar tipo) |
| src/components/sites/AddPointModal.tsx | Modificar (adicionar coords) |
| src/components/sites/EditFloorModal.tsx | Criar |
| src/components/sites/EditAreaModal.tsx | Criar |
| src/components/sites/EditPointModal.tsx | Criar |
| src/components/sites/DeleteConfirmDialog.tsx | Criar |
| src/components/sites/SiteStructureTab.tsx | Modificar (integracao) |
| src/i18n/locales/pt.json | Adicionar chaves |
| src/i18n/locales/en.json | Adicionar chaves |

---

## Consideracoes Tecnicas

1. **Migracoes**: Adicionar `description` a floors e `type` a areas nao quebra nada existente (nullable)

2. **Cascading Delete**: A BD ja deve ter ON DELETE CASCADE configurado. Confirmar antes de implementar UI.

3. **Drag-and-drop**: Usar HTML5 nativo para evitar dependencias extra. Alternativa: @dnd-kit se precisar de features avancadas.

4. **Performance**: Reordenacao faz multiple UPDATEs - considerar transaccao ou batch na Edge Function futuramente.

5. **Validacao**: Tipo de area validado no frontend (lista fixa de opcoes).
