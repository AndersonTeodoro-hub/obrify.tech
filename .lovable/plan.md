
# Plano: Pagina de Gestao de Nao-Conformidades (NonConformities.tsx)

## Resumo
Criar uma pagina completa para gestao de todas as nao-conformidades com tabela, filtros, painel lateral de detalhes, fluxo de estados, timeline de alteracoes, e exportacao para Excel.

---

## Analise do Estado Actual

### Tabelas Existentes:
- **nonconformities**: id, title, description, severity, status, due_date, responsible, corrective_action, site_id, inspection_id, inspection_item_id, standard_violated, created_by, created_at, updated_at
- **nonconformity_evidence**: id, nonconformity_id, file_path, created_at
- **sites**: id, name, address
- **inspections**: id, site_id, template_id

### Estados Existentes (Enum):
- `OPEN` - Aberta
- `IN_PROGRESS` - Em Resolucao
- `RESOLVED` - A Verificar (renomear na UI)
- `CLOSED` - Fechada

### Componentes Existentes:
- `CreateNCFromItem.tsx` - Modal para criar NC
- `SitesWithNCs.tsx` - Contador de NCs por obra no dashboard
- Componentes UI: Sheet, Table, Select, Badge, Button, Calendar

---

## Arquitectura da Solucao

```text
NonConformities.tsx (Pagina Principal)
├── Header
│   ├── Titulo + Subtitulo
│   └── Botao Exportar Excel
│
├── Filtros (NCFilters.tsx)
│   ├── Por Obra (Select)
│   ├── Por Severidade (Select)
│   ├── Por Estado (Select)
│   └── Limpar Filtros
│
├── Tabela de NCs
│   ├── ID (codigo curto)
│   ├── Obra (nome)
│   ├── Descricao (truncada 50 chars)
│   ├── Severidade (badge colorido)
│   ├── Estado (badge)
│   ├── Prazo (data formatada)
│   ├── Responsavel
│   └── Accoes (Ver)
│
└── Sheet Lateral (NCDetailSheet.tsx)
    ├── Header com titulo + severidade
    ├── Informacoes detalhadas
    ├── Fotos de evidencia
    ├── Timeline de alteracoes
    ├── Selector de estado
    └── Upload foto (se fechar)
```

---

## Ficheiros a Criar/Modificar

| Ficheiro | Accao |
|----------|-------|
| src/pages/app/NonConformities.tsx | Criar |
| src/components/nonconformities/NCFilters.tsx | Criar |
| src/components/nonconformities/NCDetailSheet.tsx | Criar |
| src/components/nonconformities/NCStatusTimeline.tsx | Criar |
| src/components/nonconformities/NCEvidenceGallery.tsx | Criar |
| src/components/nonconformities/CloseNCModal.tsx | Criar |
| src/components/layout/AppSidebar.tsx | Modificar (adicionar link) |
| src/App.tsx | Modificar (adicionar rota) |
| src/i18n/locales/pt.json | Adicionar chaves |
| src/i18n/locales/en.json | Adicionar chaves |

### Migracao de Base de Dados
Criar tabela para registar historico de alteracoes de estado:

```sql
CREATE TABLE IF NOT EXISTS public.nonconformity_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonconformity_id uuid REFERENCES public.nonconformities(id) ON DELETE CASCADE NOT NULL,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_nc_status_history_nc_id ON public.nonconformity_status_history(nonconformity_id);

-- RLS Policies
ALTER TABLE public.nonconformity_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view status history for accessible NCs"
  ON public.nonconformity_status_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM nonconformities nc
      JOIN inspections i ON i.id = nc.inspection_id
      WHERE nc.id = nonconformity_status_history.nonconformity_id
      AND can_access_site(auth.uid(), i.site_id)
    )
  );

CREATE POLICY "Users can insert status history for accessible NCs"
  ON public.nonconformity_status_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nonconformities nc
      JOIN inspections i ON i.id = nc.inspection_id
      WHERE nc.id = nonconformity_status_history.nonconformity_id
      AND can_access_site(auth.uid(), i.site_id)
    )
  );
```

---

## Componente NonConformities.tsx

### Estrutura Visual:

```text
┌─────────────────────────────────────────────────────────────────┐
│  Nao-Conformidades                           [📥 Exportar Excel]│
│  Gerir todas as nao-conformidades registadas                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ [Limpar]   │
│  │ Obra ▼       │ │ Severidade ▼ │ │ Estado ▼     │             │
│  └──────────────┘ └──────────────┘ └──────────────┘             │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  ID    │ Obra      │ Descricao      │ Sev. │ Estado │ Prazo    │
├────────┼───────────┼────────────────┼──────┼────────┼──────────┤
│  #001  │ Aurora    │ Fissura na...  │ 🔴   │ Aberta │ 15 Fev   │
│  #002  │ Mar       │ Infiltracao... │ 🟠   │ Em Res.│ 20 Fev   │
│  #003  │ Sol       │ Desvio no...   │ 🟡   │ A Ver. │ 10 Fev   │
└─────────────────────────────────────────────────────────────────┘
```

### Query de Dados:

```typescript
const { data: nonconformities } = useQuery({
  queryKey: ['all-nonconformities', siteFilter, severityFilter, statusFilter],
  queryFn: async () => {
    let query = supabase
      .from('nonconformities')
      .select(`
        *,
        sites!nonconformities_site_id_fkey(id, name),
        inspections!nonconformities_inspection_id_fkey(
          id, 
          inspection_templates(name)
        )
      `)
      .order('created_at', { ascending: false });

    if (siteFilter !== 'all') {
      query = query.eq('site_id', siteFilter);
    }
    if (severityFilter !== 'all') {
      query = query.eq('severity', severityFilter);
    }
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
});
```

---

## Componente NCDetailSheet.tsx

### Estrutura Visual:

```text
┌─────────────────────────────────────────────┐
│  NC #001                                [X] │
│  ──────────────────────────────────────────│
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │ 🔴 CRITICO                      Aberta  ││
│  └─────────────────────────────────────────┘│
│                                             │
│  Obra: Edificio Aurora                      │
│  Inspecao: Pre-Betonagem Laje              │
│  Criado por: Joao Silva                     │
│  Data: 05 Fev 2026                         │
│                                             │
│  ─────────────────────────────────────────  │
│  Descricao do Problema                      │
│  ┌─────────────────────────────────────────┐│
│  │ Fissura detectada na laje do piso 2    ││
│  │ com largura aproximada de 2mm.         ││
│  └─────────────────────────────────────────┘│
│                                             │
│  Norma Violada: NP EN 206-1                 │
│  Prazo: 15 Fev 2026                         │
│  Responsavel: Pedro Santos                  │
│                                             │
│  ─────────────────────────────────────────  │
│  Fotos de Evidencia                         │
│  ┌──────┐ ┌──────┐ ┌──────┐                │
│  │ 📷   │ │ 📷   │ │ 📷   │                │
│  └──────┘ └──────┘ └──────┘                │
│                                             │
│  ─────────────────────────────────────────  │
│  Accao Corretiva                            │
│  ┌─────────────────────────────────────────┐│
│  │ Injectar resina epoxy nas fissuras...  ││
│  └─────────────────────────────────────────┘│
│                                             │
│  ─────────────────────────────────────────  │
│  Historico                                  │
│  ○ Aberta - 05 Fev 2026 - Joao Silva       │
│  │                                          │
│  ○ Em Resolucao - 07 Fev 2026 - Pedro      │
│  │  "Iniciada correcao com resina"         │
│                                             │
│  ─────────────────────────────────────────  │
│  Alterar Estado                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ Aberta   │ │ Em Res.  │ │ A Verif. │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│  ┌────────────────────────────────────┐    │
│  │ Fechada (requer foto comprovacao)  │    │
│  └────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Componente NCStatusTimeline.tsx

Timeline visual mostrando historico de mudancas de estado:

```text
interface StatusHistoryItem {
  id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string;
  notes: string | null;
  created_at: string;
  profiles?: { full_name: string };
}
```

Estilo visual:
- Linha vertical conectando os pontos
- Circulo colorido por estado
- Data + Nome do utilizador
- Nota opcional abaixo

---

## Componente CloseNCModal.tsx

Modal que aparece quando o utilizador tenta mudar estado para "Fechada":

```text
┌─────────────────────────────────────────────┐
│  Fechar Nao-Conformidade               [X] │
├─────────────────────────────────────────────┤
│                                             │
│  Para fechar esta NC, e necessario anexar  │
│  uma foto comprovando a resolucao.          │
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │  [📷] Selecionar foto de comprovacao   ││
│  └─────────────────────────────────────────┘│
│                                             │
│  Notas de Encerramento                      │
│  ┌─────────────────────────────────────────┐│
│  │ Descreva como foi resolvido...         ││
│  └─────────────────────────────────────────┘│
│                                             │
│                  [Cancelar]  [Fechar NC]    │
└─────────────────────────────────────────────┘
```

---

## Fluxo de Estados

```text
     ┌────────┐
     │ ABERTA │ (Estado inicial)
     └────┬───┘
          │
          ▼
   ┌─────────────┐
   │ EM RESOLUCAO│
   └──────┬──────┘
          │
          ▼
   ┌────────────┐
   │ A VERIFICAR│
   └──────┬─────┘
          │ (requer foto)
          ▼
     ┌────────┐
     │ FECHADA│ (Estado final)
     └────────┘
```

### Logica de Transicao:
- OPEN -> IN_PROGRESS: Pode mudar livremente
- IN_PROGRESS -> RESOLVED: Pode mudar livremente
- RESOLVED -> CLOSED: Requer foto de comprovacao
- Qualquer estado pode voltar atras (exceto CLOSED)
- CLOSED e estado final, nao pode ser alterado

---

## Exportacao Excel

Usar biblioteca nativa do browser para gerar CSV (compativel com Excel):

```typescript
const exportToExcel = () => {
  if (!nonconformities) return;
  
  const headers = ['ID', 'Obra', 'Descricao', 'Severidade', 'Estado', 'Prazo', 'Responsavel', 'Criado em'];
  
  const rows = nonconformities.map((nc, index) => [
    `#${String(index + 1).padStart(3, '0')}`,
    nc.sites?.name || '-',
    nc.description || nc.title,
    t(`nc.severity${nc.severity.charAt(0).toUpperCase() + nc.severity.slice(1)}`),
    t(`nc.status.${nc.status.toLowerCase()}`),
    nc.due_date ? format(new Date(nc.due_date), 'dd/MM/yyyy') : '-',
    nc.responsible || '-',
    format(new Date(nc.created_at), 'dd/MM/yyyy HH:mm'),
  ]);
  
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  
  const bom = '\uFEFF'; // BOM para suportar acentos
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nao-conformidades_${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
```

---

## Navegacao - AppSidebar.tsx

Adicionar link na navegacao principal:

```typescript
const mainItems = [
  { title: t('nav.dashboard'), url: '/app', icon: LayoutDashboard },
  { title: t('nav.organizations'), url: '/app/organizations', icon: Building2 },
  { title: t('nav.sites'), url: '/app/sites', icon: HardHat },
  { title: t('nav.captures'), url: '/app/captures', icon: Camera },
  { title: t('nav.inspections'), url: '/app/inspections', icon: ClipboardCheck },
  { title: t('nav.nonconformities'), url: '/app/nonconformities', icon: AlertTriangle }, // NOVO
  { title: t('nav.reports'), url: '/app/reports', icon: BarChart3 },
];
```

---

## Rota - App.tsx

Adicionar nova rota:

```typescript
import NonConformities from "./pages/app/NonConformities";

// Dentro das rotas do AppLayout:
<Route path="nonconformities" element={<NonConformities />} />
```

---

## Traducoes a Adicionar

### Portugues (pt.json):
```json
"nav": {
  "nonconformities": "Nao-Conformidades"
},
"ncPage": {
  "title": "Nao-Conformidades",
  "subtitle": "Gerir todas as nao-conformidades registadas",
  "exportExcel": "Exportar Excel",
  "filterBySite": "Filtrar por obra",
  "filterBySeverity": "Filtrar por severidade",
  "filterByStatus": "Filtrar por estado",
  "allSites": "Todas as obras",
  "allSeverities": "Todas as severidades",
  "allStatuses": "Todos os estados",
  "clearFilters": "Limpar filtros",
  "noResults": "Nenhuma nao-conformidade encontrada",
  "noResultsDesc": "Nao existem NCs com os filtros aplicados",
  "columns": {
    "id": "ID",
    "site": "Obra",
    "description": "Descricao",
    "severity": "Severidade",
    "status": "Estado",
    "dueDate": "Prazo",
    "responsible": "Responsavel"
  }
},
"nc": {
  "status": {
    "open": "Aberta",
    "in_progress": "Em Resolucao",
    "resolved": "A Verificar",
    "closed": "Fechada"
  },
  "detail": {
    "site": "Obra",
    "inspection": "Inspecao",
    "createdBy": "Criado por",
    "createdAt": "Data de Criacao",
    "description": "Descricao do Problema",
    "standardViolated": "Norma Violada",
    "dueDate": "Prazo para Resolucao",
    "responsible": "Responsavel",
    "correctiveAction": "Accao Corretiva",
    "evidence": "Fotos de Evidencia",
    "noEvidence": "Sem fotos de evidencia",
    "history": "Historico",
    "changeStatus": "Alterar Estado",
    "statusChanged": "Estado alterado com sucesso",
    "closeNC": "Fechar NC",
    "closingPhotoRequired": "Para fechar esta NC, anexe uma foto comprovando a resolucao",
    "closingNotes": "Notas de Encerramento",
    "closingNotesPlaceholder": "Descreva como foi resolvido...",
    "selectPhoto": "Selecionar foto de comprovacao",
    "ncClosed": "Nao-conformidade fechada com sucesso"
  }
}
```

### Ingles (en.json):
```json
"nav": {
  "nonconformities": "Non-Conformities"
},
"ncPage": {
  "title": "Non-Conformities",
  "subtitle": "Manage all registered non-conformities",
  "exportExcel": "Export Excel",
  "filterBySite": "Filter by site",
  "filterBySeverity": "Filter by severity",
  "filterByStatus": "Filter by status",
  "allSites": "All sites",
  "allSeverities": "All severities",
  "allStatuses": "All statuses",
  "clearFilters": "Clear filters",
  "noResults": "No non-conformities found",
  "noResultsDesc": "There are no NCs with the applied filters",
  "columns": {
    "id": "ID",
    "site": "Site",
    "description": "Description",
    "severity": "Severity",
    "status": "Status",
    "dueDate": "Due Date",
    "responsible": "Responsible"
  }
},
"nc": {
  "status": {
    "open": "Open",
    "in_progress": "In Progress",
    "resolved": "To Verify",
    "closed": "Closed"
  },
  "detail": {
    "site": "Site",
    "inspection": "Inspection",
    "createdBy": "Created by",
    "createdAt": "Created at",
    "description": "Problem Description",
    "standardViolated": "Standard Violated",
    "dueDate": "Due Date",
    "responsible": "Responsible",
    "correctiveAction": "Corrective Action",
    "evidence": "Evidence Photos",
    "noEvidence": "No evidence photos",
    "history": "History",
    "changeStatus": "Change Status",
    "statusChanged": "Status changed successfully",
    "closeNC": "Close NC",
    "closingPhotoRequired": "To close this NC, attach a photo proving the resolution",
    "closingNotes": "Closing Notes",
    "closingNotesPlaceholder": "Describe how it was resolved...",
    "selectPhoto": "Select proof photo",
    "ncClosed": "Non-conformity closed successfully"
  }
}
```

---

## Resumo das Alteracoes

1. **Migracao BD**: Criar tabela `nonconformity_status_history` para timeline
2. **NonConformities.tsx**: Pagina principal com tabela e filtros
3. **NCFilters.tsx**: Componente de filtros reutilizavel
4. **NCDetailSheet.tsx**: Painel lateral com detalhes completos
5. **NCStatusTimeline.tsx**: Timeline visual do historico
6. **NCEvidenceGallery.tsx**: Galeria de fotos de evidencia
7. **CloseNCModal.tsx**: Modal para fechar NC com foto obrigatoria
8. **AppSidebar.tsx**: Adicionar link na navegacao
9. **App.tsx**: Adicionar rota /app/nonconformities
10. **Traducoes**: Novas chaves em PT e EN

---

## Consideracoes Tecnicas

1. **Performance**: Usar paginacao se lista crescer muito
2. **Exportacao**: CSV com BOM para suportar caracteres especiais
3. **RLS**: Policies existentes garantem acesso apenas a NCs de sites acessiveis
4. **Offline (futuro)**: Estrutura preparada para sincronizacao
5. **Responsive**: Sheet lateral funciona bem em mobile
