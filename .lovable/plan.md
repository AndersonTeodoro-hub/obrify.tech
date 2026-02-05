
# Plano: Sistema de Nao-Conformidades Integrado com Inspeccoes

## Resumo
Melhorar o sistema de nao-conformidades existente para incluir todos os campos requeridos, foto-evidencias, e contador de NCs abertas por obra no dashboard.

---

## Analise do Estado Actual

### O que ja existe:
- Componente `CreateNCFromItem.tsx` com modal basico
- Tabela `nonconformities` com campos: title, description, severity, due_date, corrective_action, responsible, status
- `SiteOverviewTab.tsx` ja mostra contador de NCs abertas
- Integracao com `InspectionDetail.tsx` que abre modal quando item e marcado como NC

### O que falta implementar:
1. Campo descricao obrigatorio (actualmente opcional)
2. Novas opcoes de severidade: Critico (vermelho), Importante (laranja), Menor (amarelo)
3. Date picker para prazo (actualmente usa input nativo)
4. Upload de fotos de evidencia
5. Campo para norma/especificacao violada
6. Contador de NCs por obra no Dashboard

---

## Alteracoes na Base de Dados

Adicionar novos campos a tabela `nonconformities`:

```text
ALTER TABLE nonconformities
ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS standard_violated text,
ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS idx_nonconformities_site_id ON nonconformities(site_id);
```

Criar tabela para evidencias de NC:

```text
CREATE TABLE IF NOT EXISTS nonconformity_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonconformity_id uuid REFERENCES nonconformities(id) ON DELETE CASCADE NOT NULL,
  capture_id uuid REFERENCES captures(id) ON DELETE SET NULL,
  file_path text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_nc_evidence_nc_id ON nonconformity_evidence(nonconformity_id);
```

---

## Arquitectura da Solucao

```text
CreateNCFromItem.tsx (melhorado)
├── Titulo (editavel, pre-preenchido)
├── Descricao * (obrigatorio)
├── Severidade (nova UI com cores)
│   ├── Critico (vermelho) - value: 'critical'
│   ├── Importante (laranja) - value: 'high'
│   └── Menor (amarelo) - value: 'medium'
├── Prazo para Resolucao (DatePicker)
├── Norma/Especificacao Violada (texto)
├── Fotos de Evidencia (upload multiplo)
│   └── DropZone + Grid de previews
└── Accao Corretiva (opcional)
```

---

## Ficheiros a Modificar/Criar

| Ficheiro | Accao |
|----------|-------|
| supabase/migrations/xxx.sql | Criar (adicionar campos) |
| src/components/inspections/CreateNCFromItem.tsx | Reescrever |
| src/pages/app/Dashboard.tsx | Modificar (adicionar NCs por obra) |
| src/i18n/locales/pt.json | Adicionar chaves |
| src/i18n/locales/en.json | Adicionar chaves |

---

## Componente CreateNCFromItem.tsx (Reescrito)

### Interface Melhorada:

```text
┌─────────────────────────────────────────────────────────────┐
│  ⚠ Criar Nao-Conformidade                             [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Titulo                                                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ NC - Cofragem com residuos                           │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Descricao do Problema *                                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Descreva o problema encontrado...                    │  │
│  │                                                       │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Severidade                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ ● Critico    │ │   Importante │ │     Menor    │        │
│  │   (vermelho) │ │   (laranja)  │ │   (amarelo)  │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                             │
│  Prazo para Resolucao         Norma/Especificacao Violada  │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  │
│  │ 📅 15 Fev 2026          │  │ NP EN 206-1            │  │
│  └─────────────────────────┘  └─────────────────────────┘  │
│                                                             │
│  Fotos de Evidencia                                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  [📷] [📷] [📷]  [+ Adicionar]                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Accao Corretiva (opcional)                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Descreva a acao corretiva...                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│                              [Cancelar]  [Registar NC]      │
└─────────────────────────────────────────────────────────────┘
```

### Severidade com Cores:

```text
| Valor    | Label       | Cor de Fundo      | Cor Texto |
|----------|-------------|-------------------|-----------|
| critical | Critico     | bg-red-500/20     | text-red  |
| high     | Importante  | bg-orange-500/20  | text-orange|
| medium   | Menor       | bg-yellow-500/20  | text-yellow|
```

### Fluxo de Upload de Fotos:

```text
1. Utilizador seleciona fotos via DropZone
2. Upload para Storage (bucket: captures)
3. Criar registo em captures com site_id
4. Criar ligacao em nonconformity_evidence
5. Mostrar preview com opcao de remover
```

---

## Dashboard com NCs por Obra

Adicionar secao ou modificar cards para mostrar NCs abertas por obra:

```text
┌─────────────────────────────────────────────────────────────┐
│  Obras com Nao-Conformidades                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [🏗] Edificio Aurora          NCs Abertas: 5  [→]  │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [🏗] Residencial Mar          NCs Abertas: 2  [→]  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Query para NCs por Obra:

```text
SELECT 
  s.id, s.name,
  COUNT(nc.id) as open_ncs
FROM sites s
LEFT JOIN inspections i ON i.site_id = s.id
LEFT JOIN nonconformities nc ON nc.inspection_id = i.id AND nc.status = 'OPEN'
WHERE s.org_id IN (user_org_ids)
GROUP BY s.id, s.name
HAVING COUNT(nc.id) > 0
ORDER BY open_ncs DESC
```

---

## Traducoes a Adicionar

```text
nc.title: "Titulo"
nc.description: "Descricao do Problema"
nc.descriptionRequired: "A descricao e obrigatoria"
nc.severity: "Severidade"
nc.severityCritical: "Critico"
nc.severityHigh: "Importante"
nc.severityMedium: "Menor"
nc.dueDate: "Prazo para Resolucao"
nc.standardViolated: "Norma/Especificacao Violada"
nc.standardViolatedPlaceholder: "Ex: NP EN 206-1, Decreto-Lei..."
nc.evidence: "Fotos de Evidencia"
nc.addEvidence: "Adicionar Fotos"
nc.correctiveAction: "Acao Corretiva"
nc.correctiveActionPlaceholder: "Descreva a acao corretiva..."
nc.create: "Registar NC"
nc.created: "Nao-conformidade registada com sucesso"

dashboard.sitesWithNCs: "Obras com Nao-Conformidades"
dashboard.openNCsCount: "{{count}} NC(s) aberta(s)"
dashboard.noOpenNCs: "Nenhuma NC aberta"
```

---

## Validacoes do Formulario

```text
Campos Obrigatorios:
- Titulo (minimo 5 caracteres)
- Descricao (minimo 10 caracteres)
- Severidade (deve selecionar uma)

Campos Opcionais:
- Prazo para Resolucao
- Norma/Especificacao Violada
- Fotos de Evidencia
- Accao Corretiva
```

---

## Fluxo Completo

```text
1. Utilizador marca item como "Nao Conforme" no checklist
   ↓
2. Modal de NC abre automaticamente
   ↓
3. Titulo pre-preenchido com "NC - [titulo do item]"
   ↓
4. Utilizador preenche descricao (obrigatorio)
   ↓
5. Seleciona severidade (Critico/Importante/Menor)
   ↓
6. Opcionalmente define prazo via DatePicker
   ↓
7. Opcionalmente indica norma violada
   ↓
8. Opcionalmente anexa fotos de evidencia
   ↓
9. Clica "Registar NC"
   ↓
10. Sistema cria:
    - Registo em nonconformities com status = 'OPEN'
    - Registos em nonconformity_evidence para cada foto
   ↓
11. Toast de sucesso
12. Modal fecha
13. Item do checklist permanece como NC
```

---

## Secao Tecnica

### Props do Componente Melhorado:

```text
interface CreateNCFromItemProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspectionId: string;
  inspectionItemId: string;
  siteId: string;          // NOVO - para associar NC directamente a obra
  itemTitle: string;
  onSuccess: () => void;
}
```

### Dados a Guardar:

```text
nonconformities:
  - inspection_id
  - inspection_item_id
  - site_id (NOVO)
  - title
  - description (obrigatorio)
  - severity ('critical' | 'high' | 'medium')
  - due_date
  - standard_violated (NOVO)
  - corrective_action
  - status = 'OPEN'
  - created_by (NOVO)
```

### RLS para Nova Tabela:

```text
-- nonconformity_evidence RLS
CREATE POLICY "Users can view evidence for accessible NCs"
  ON nonconformity_evidence FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM nonconformities nc
      JOIN inspections i ON i.id = nc.inspection_id
      WHERE nc.id = nonconformity_evidence.nonconformity_id
      AND can_access_site(auth.uid(), i.site_id)
    )
  );

CREATE POLICY "Users can insert evidence for accessible NCs"
  ON nonconformity_evidence FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nonconformities nc
      JOIN inspections i ON i.id = nc.inspection_id
      WHERE nc.id = nonconformity_evidence.nonconformity_id
      AND can_access_site(auth.uid(), i.site_id)
    )
  );
```

---

## Resumo das Alteracoes

1. **Migracao BD**: Adicionar campos `site_id`, `standard_violated`, `created_by` a nonconformities + criar tabela `nonconformity_evidence`
2. **CreateNCFromItem.tsx**: Reescrever com nova UI, campos obrigatorios, DatePicker, upload de fotos
3. **InspectionDetail.tsx**: Passar `siteId` ao modal de NC
4. **Dashboard.tsx**: Adicionar secao de obras com NCs abertas
5. **Traducoes**: Novas chaves em PT e EN
