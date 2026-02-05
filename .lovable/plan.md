
# Plano: Pagina de Fiscalizacoes Completa

## Resumo
Implementar a pagina Inspections.tsx com lista de fiscalizacoes, filtros avancados e um wizard de 3 passos para criar novas fiscalizacoes. A criacao insere um registo na tabela `inspections` com estado "draft" e redireciona para uma pagina de preenchimento.

---

## Analise do Estado Actual

### Tabela `inspections` (ja existe):
- `id`, `site_id`, `template_id`, `created_by`
- `floor_id`, `area_id`, `capture_point_id` (opcional)
- `status` (text, default 'DRAFT')
- `scheduled_at`, `assigned_to`, `structure_type`
- `created_at`, `updated_at`

### O que ja existe:
- Pagina placeholder em `Inspections.tsx`
- Componente `SiteInspectionsTab.tsx` com padrao de listagem
- Sistema de templates funcional
- Filtros em `CaptureFilters.tsx` como referencia

### O que falta:
1. Lista de fiscalizacoes com dados completos
2. Filtros por obra, estado e data
3. Wizard de 3 passos para criar fiscalizacao
4. Rota para pagina de preenchimento

---

## Arquitectura da Solucao

```text
Inspections.tsx
├── Header (titulo + botao Nova Fiscalizacao)
├── InspectionFilters.tsx
│   ├── Filtro por Obra (Select)
│   ├── Filtro por Estado (Select)
│   └── Filtro por Data (DatePicker ou Select com intervalos)
├── InspectionsList
│   └── Table com: Data, Obra, Template, Estado, Inspector, Acoes
└── NewInspectionWizard.tsx (Dialog)
    ├── Passo 1: Selecionar Obra e Elemento
    ├── Passo 2: Selecionar Template
    └── Passo 3: Confirmar e Criar
```

---

## Ficheiros a Criar/Modificar

| Ficheiro | Accao |
|----------|-------|
| src/pages/app/Inspections.tsx | Reescrever completamente |
| src/components/inspections/InspectionFilters.tsx | Criar |
| src/components/inspections/NewInspectionWizard.tsx | Criar |
| src/pages/app/InspectionDetail.tsx | Criar (pagina de preenchimento) |
| src/App.tsx | Adicionar rota `/app/inspections/:id` |
| src/i18n/locales/pt.json | Adicionar chaves |
| src/i18n/locales/en.json | Adicionar chaves |

---

## Componentes Detalhados

### 1. Inspections.tsx (Pagina Principal)

**Estrutura:**
```text
- Query para listar fiscalizacoes com joins:
  - site (nome)
  - template (nome)
  - created_by (perfil do inspector)
  
- Estado para filtros:
  - siteId: string | null
  - status: 'all' | 'draft' | 'in_progress' | 'completed'
  - dateFrom: Date | null
  - dateTo: Date | null

- Tabela com colunas:
  - Data (scheduled_at ou created_at)
  - Obra (site.name)
  - Template (template.name)
  - Estado (badge colorido)
  - Inspector (profiles.full_name via created_by)
  - Acoes (Ver, Editar)
```

**Query SQL equivalente:**
```text
SELECT 
  i.*,
  s.name as site_name,
  t.name as template_name,
  p.full_name as inspector_name
FROM inspections i
JOIN sites s ON s.id = i.site_id
JOIN inspection_templates t ON t.id = i.template_id
LEFT JOIN profiles p ON p.user_id = i.created_by
WHERE [filtros]
ORDER BY i.created_at DESC
```

### 2. InspectionFilters.tsx

**Filtros:**
1. **Obra** - Select com todas as obras do utilizador
2. **Estado** - Select com opcoes:
   - Todos
   - Rascunho (draft)
   - Em Curso (in_progress)
   - Concluida (completed)
3. **Periodo** - Select com intervalos pre-definidos:
   - Todos
   - Ultimos 7 dias
   - Ultimos 30 dias
   - Este mes
   - Mes anterior

**Botao Limpar** - Aparece quando ha filtros activos

### 3. NewInspectionWizard.tsx

**Wizard de 3 passos com navegacao:**

#### Passo 1: Selecionar Obra e Elemento
```text
<Select> Obra * (obrigatorio)
<Select> Piso (opcional, carrega quando obra selecionada)
<Select> Area (opcional, carrega quando piso selecionado)
<Select> Ponto de Captura (opcional, carrega quando area selecionada)
```

#### Passo 2: Selecionar Template
```text
<RadioGroup ou Cards clicaveis>
  - Mostrar templates da organizacao
  - Cada card mostra: nome, categoria (badge), numero de itens
  - Template selecionado destacado
</RadioGroup>
```

#### Passo 3: Confirmar e Criar
```text
Resumo:
  - Obra: [nome da obra]
  - Localizacao: [piso > area > ponto] ou "Geral"
  - Template: [nome do template]
  - Inspector: [nome do utilizador actual]
  
<Button>Criar Fiscalizacao</Button>
```

**Mutation:**
```text
INSERT INTO inspections (
  site_id,
  template_id,
  created_by,
  floor_id,      -- opcional
  area_id,       -- opcional
  capture_point_id, -- opcional
  status,
  scheduled_at
) VALUES (...)
RETURNING id
```

**Apos criar:**
- Toast de sucesso
- navigate(`/app/inspections/${newId}`)

### 4. InspectionDetail.tsx (Pagina de Preenchimento)

**Estrutura inicial (placeholder para futuro):**
```text
- Cabecalho com info da fiscalizacao
- Lista de itens do template para preencher
- Botoes: Guardar Rascunho, Concluir
```

Para esta fase, criar apenas um placeholder que mostra os dados basicos da fiscalizacao.

---

## Navegacao do Wizard

```text
Estado: currentStep (1 | 2 | 3)

Passo 1 → Passo 2: Botao "Seguinte" (habilitado se obra selecionada)
Passo 2 → Passo 3: Botao "Seguinte" (habilitado se template selecionado)
Passo 3 → Criar: Botao "Criar Fiscalizacao"

Navegacao:
- Voltar: permite voltar aos passos anteriores
- Indicador visual de passos (1 - 2 - 3)
```

---

## Estados e Badges

| Estado | Valor BD | Cor |
|--------|----------|-----|
| Rascunho | draft | Cinza (muted) |
| Em Curso | in_progress | Amarelo |
| Concluida | completed | Verde |

---

## Traducoes a Adicionar

```text
inspections.filterBySite: "Filtrar por obra"
inspections.filterByStatus: "Filtrar por estado"
inspections.filterByDate: "Filtrar por data"
inspections.allStatuses: "Todos os estados"
inspections.last7Days: "Últimos 7 dias"
inspections.last30Days: "Últimos 30 dias"
inspections.thisMonth: "Este mês"
inspections.lastMonth: "Mês anterior"
inspections.allDates: "Todas as datas"
inspections.clearFilters: "Limpar filtros"
inspections.site: "Obra"
inspections.location: "Localização"
inspections.inspector: "Inspector"
inspections.date: "Data"
inspections.general: "Geral"
inspections.createdSuccessfully: "Fiscalização criada com sucesso"
inspections.wizard.title: "Nova Fiscalização"
inspections.wizard.step1Title: "Selecionar Obra"
inspections.wizard.step1Desc: "Escolha a obra e o local da fiscalização"
inspections.wizard.step2Title: "Selecionar Template"
inspections.wizard.step2Desc: "Escolha o checklist a utilizar"
inspections.wizard.step3Title: "Confirmar"
inspections.wizard.step3Desc: "Reveja os dados e crie a fiscalização"
inspections.wizard.summary: "Resumo"
inspections.wizard.selectSite: "Selecione uma obra"
inspections.wizard.selectTemplate: "Selecione um template"
inspections.wizard.optionalLocation: "Localização (opcional)"
inspections.view: "Ver"
inspections.continue: "Continuar"
```

---

## Rota Nova

Adicionar em App.tsx:
```text
<Route path="inspections/:inspectionId" element={<InspectionDetail />} />
```

---

## Fluxo de Utilizacao

### Listar Fiscalizacoes:
```text
1. Utilizador acede a /app/inspections
2. Ve tabela com todas as fiscalizacoes
3. Usa filtros para refinar busca
4. Clica em "Ver" para abrir detalhe
```

### Criar Nova Fiscalizacao:
```text
1. Clica em "+ Nova Fiscalizacao"
2. Wizard abre no Passo 1
3. Seleciona obra (obrigatorio)
4. Opcionalmente seleciona piso/area/ponto
5. Clica "Seguinte"
6. No Passo 2, seleciona template
7. Clica "Seguinte"
8. No Passo 3, revisa resumo
9. Clica "Criar Fiscalizacao"
10. Registo criado com status "draft"
11. Redireciona para /app/inspections/:id
```

---

## Consideracoes Tecnicas

1. **Queries Optimizadas**: Usar joins para evitar N+1 queries

2. **Filtros**: Aplicar filtros no lado do cliente inicialmente, migrar para servidor se lista crescer

3. **Wizard State**: Manter estado local no componente, resetar ao fechar

4. **RLS**: Fiscalizacoes ja tem policies que verificam `can_access_site()`

5. **Status Mapping**: 
   - BD usa maiusculas (DRAFT, IN_PROGRESS, COMPLETED)
   - Normalizar para minusculas no frontend ou ajustar badges

6. **Inspector**: Usar tabela `profiles` para obter nome do utilizador via `created_by`

---

## Interface Visual do Wizard

```text
┌────────────────────────────────────────────────────────┐
│  Nova Fiscalização                              [X]   │
├────────────────────────────────────────────────────────┤
│                                                        │
│   ● ───── ○ ───── ○                                   │
│   1       2       3                                    │
│  Obra  Template Confirmar                             │
│                                                        │
│ ┌────────────────────────────────────────────────┐    │
│ │                                                │    │
│ │  Selecionar Obra                               │    │
│ │  Escolha a obra e o local da fiscalizacao      │    │
│ │                                                │    │
│ │  Obra *                                        │    │
│ │  ┌──────────────────────────────────────────┐ │    │
│ │  │ Selecione uma obra              ▼        │ │    │
│ │  └──────────────────────────────────────────┘ │    │
│ │                                                │    │
│ │  Piso (opcional)                               │    │
│ │  ┌──────────────────────────────────────────┐ │    │
│ │  │ Todos os pisos                 ▼        │ │    │
│ │  └──────────────────────────────────────────┘ │    │
│ │                                                │    │
│ └────────────────────────────────────────────────┘    │
│                                                        │
│                              [Cancelar]  [Seguinte →] │
└────────────────────────────────────────────────────────┘
```

---

## Resumo das Alteracoes

1. **Inspections.tsx**: Lista completa com tabela e filtros
2. **InspectionFilters.tsx**: Componente de filtros reutilizavel
3. **NewInspectionWizard.tsx**: Wizard de 3 passos
4. **InspectionDetail.tsx**: Pagina placeholder para preenchimento
5. **App.tsx**: Nova rota para detalhe
6. **Traducoes**: Novas chaves em PT e EN
