
# Plano: Modulo Completo de Gestao de Projectos de Obra

## Resumo

Criar sistema de gestao de projectos de obra com 3 novas tabelas (projects, project_elements, project_conflicts), nova tab "Projectos" no detalhe da obra com grid por especialidade, upload de ficheiros, visualizador e sumario de conflitos.

Nota: ja existe uma tabela `project_files` e enum `project_file_type` na base de dados. As novas tabelas vao complementar essa estrutura existente.

---

## 1. Migracao de Base de Dados

### Enums novos

```text
project_specialty: topography, architecture, structure, plumbing, electrical, hvac, gas, telecom, other
project_analysis_status: pending, analyzing, completed, failed
conflict_type: spatial_overlap, dimension_mismatch, missing_provision, code_violation
conflict_severity: critical, high, medium, low
conflict_status: detected, confirmed, dismissed, resolved, nc_created
```

### Tabela: projects

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID FK -> organizations | |
| site_id | UUID FK -> sites | |
| specialty | project_specialty enum | |
| name | TEXT | |
| description | TEXT nullable | |
| floor_or_zone | TEXT nullable | |
| version | TEXT nullable | |
| is_current_version | BOOLEAN DEFAULT true | |
| file_url | TEXT nullable | |
| file_type | TEXT nullable | |
| file_size | BIGINT nullable | |
| uploaded_by | UUID | auth.uid |
| uploaded_at | TIMESTAMPTZ DEFAULT now() | |
| analyzed_at | TIMESTAMPTZ nullable | |
| analysis_status | project_analysis_status DEFAULT 'pending' | |

### Tabela: project_elements

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | |
| project_id | UUID FK -> projects ON DELETE CASCADE | |
| element_type | TEXT | |
| element_code | TEXT nullable | |
| location_description | TEXT nullable | |
| properties | JSONB DEFAULT '{}' | |
| confidence | FLOAT nullable | |
| created_at | TIMESTAMPTZ DEFAULT now() | |

### Tabela: project_conflicts

| Coluna | Tipo | Notas |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID FK -> organizations | |
| site_id | UUID FK -> sites | |
| project1_id | UUID FK -> projects | |
| project2_id | UUID FK -> projects | |
| conflict_type | conflict_type enum | |
| severity | conflict_severity enum | |
| title | TEXT | |
| description | TEXT nullable | |
| location_description | TEXT nullable | |
| ai_confidence | FLOAT nullable | |
| status | conflict_status enum DEFAULT 'detected' | |
| resolved_by | UUID nullable | |
| resolved_at | TIMESTAMPTZ nullable | |
| resolution_notes | TEXT nullable | |
| related_nc_id | UUID nullable FK -> nonconformities | |
| detected_at | TIMESTAMPTZ DEFAULT now() | |

### RLS Policies

- **projects**: SELECT/INSERT/UPDATE/DELETE para membros da organizacao via `is_org_member(auth.uid(), organization_id)`
- **project_elements**: SELECT para membros via join com projects; INSERT/UPDATE/DELETE para admin/manager
- **project_conflicts**: SELECT para membros via join; INSERT/UPDATE para admin/manager/inspector

---

## 2. Ficheiros a Criar

| Ficheiro | Descricao |
|----------|-----------|
| `src/components/sites/SiteProjectsTab.tsx` | Tab principal com grid de especialidades e lista de projectos |
| `src/components/sites/UploadProjectModal.tsx` | Modal de upload com dropzone, selects e checkbox |
| `src/components/sites/ProjectViewer.tsx` | Visualizador fullscreen com zoom/pan e painel lateral |
| `src/components/sites/ProjectConflictsSummary.tsx` | Card de sumario de conflitos com breakdown por severidade |

## 3. Ficheiros a Modificar

| Ficheiro | Alteracao |
|----------|-----------|
| `src/pages/app/SiteDetail.tsx` | Adicionar tab "Projectos" (grid-cols-5 -> grid-cols-6) |

---

## 4. Detalhes de Implementacao

### SiteProjectsTab - Layout

A tab tera dois modos:

**Modo Grid (vista inicial):**
- Grid de 9 cards, um por especialidade
- Cada card mostra: icone da especialidade, nome, contagem de documentos, estado da ultima versao
- Icones: Topografia (Map), Arquitectura (Building2), Estruturas (Columns3), Aguas (Droplets), AVAC (Wind), Electricidade (Zap), Gas (Flame), Telecom (Radio), Outros (FileStack)
- Card clicavel abre lista filtrada por essa especialidade

**Modo Lista (ao clicar numa especialidade):**
- Breadcrumb: Projectos > {Especialidade}
- Tabela com colunas: Nome, Piso/Zona, Versao (badge "Actual" se is_current_version), Data upload, Estado analise (badge colorido), Conflitos (badge count)
- Accoes por linha: Ver, Download, Eliminar
- Botao "+ Carregar Projecto" (pre-selecciona a especialidade)

### UploadProjectModal

- Select de especialidade (obrigatorio, pre-seleccionado se vem de uma especialidade)
- Select de piso/zona com opcoes: Geral, Cave, Piso 0 a Piso 10, Cobertura, e input livre "Outro"
- Input de versao (texto livre)
- Checkbox "Marcar como versao actual"
- Textarea de descricao (opcional)
- DropZone reutilizando o padrao existente, aceita PDF/PNG/JPG, max 50MB
- Ao submeter: upload para bucket `documents` na pasta `organizations/{orgId}/sites/{siteId}/projects/{specialty}/`, cria registo na tabela `projects`

### ProjectViewer

- Dialog fullscreen (ou overlay) ao clicar num projecto
- Se PDF: usa `<iframe>` com o URL do ficheiro
- Se imagem: componente com zoom/pan (CSS transform)
- Painel lateral direito (colapsavel): metadados do projecto, estado da analise, lista de elementos detectados (se existirem), lista de conflitos relacionados
- Botoes: Download, Fechar

### ProjectConflictsSummary

- Card destacado no topo da tab se existem conflitos com status != 'resolved' e != 'dismissed'
- Mostra: "X incompatibilidades detectadas"
- Breakdown visual por severidade (badges critical/high/medium/low com contagem)
- Cada badge e clicavel e filtra a lista

### Fluxo de Upload

```text
1. User clica "+ Carregar Projecto"
2. Preenche modal (especialidade, piso, versao, ficheiro)
3. Se "versao actual" marcado -> UPDATE projects SET is_current_version = false WHERE site_id AND specialty AND is_current_version = true
4. Upload ficheiro para storage bucket "documents"
5. INSERT na tabela projects com file_url, file_type, file_size
6. Fecha modal e invalida queries
```

### Integracao com SiteDetail

- Adicionar import de SiteProjectsTab
- Adicionar TabsTrigger "projects" com texto traduzido
- Adicionar TabsContent com `<SiteProjectsTab siteId={siteId!} orgId={site.org_id} />`
- Alterar grid-cols-5 para grid-cols-6
