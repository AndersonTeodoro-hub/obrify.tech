

# Integrar IncompatiCheck na Plataforma Obrify (Parte 1 de 2)

## Resumo

Adicionar o modulo IncompatiCheck como nova pagina protegida em `/app/incompaticheck`, com entrada no sidebar e tabelas de suporte na base de dados.

## Nota sobre o codigo colado

O codigo JSX colado tem problemas de formatacao -- varios elementos HTML/JSX perderam as tags (por exemplo `<div>`, `<span>`, `<button>` aparecem sem as tags, ficando so texto). Vou reconstruir o componente com a mesma logica e estrutura, corrigindo a sintaxe JSX para que compile correctamente. A logica, os dados mock, os tipos e os sub-componentes serao mantidos exactamente como indicado.

## Alteracoes

### 1. Base de dados -- 5 novas tabelas

Criar via migracao SQL:
- `incompaticheck_projects` -- projectos carregados pelo utilizador
- `incompaticheck_analyses` -- analises executadas
- `incompaticheck_findings` -- incompatibilidades detectadas
- `incompaticheck_reports` -- relatorios gerados
- `incompaticheck_chat` -- historico de chat com agente

Todas com RLS activado e politicas para que cada utilizador so aceda aos seus dados. A tabela `incompaticheck_findings` tera politica baseada no `analysis_id` ligado ao `user_id` da analise.

**Nota importante**: Nao usar `REFERENCES auth.users(id)` directamente. Em vez disso, usar `UUID NOT NULL` para `user_id` com RLS baseado em `auth.uid()`.

### 2. Storage -- novo bucket

Criar bucket `project-files` para ficheiros de projecto (limite 500MB).

### 3. Novo ficheiro `src/pages/app/IncompatiCheck.tsx`

Contem todos os sub-componentes e tipos fornecidos:
- `SEVERITY_CONFIG`, `PROJECT_TYPES`, constantes
- Tipos `Project`, `Incompatibility`, `ChatMessage`
- Dados mock (`MOCK_PROJECTS`, `MOCK_INCOMPATIBILITIES`)
- Componentes: `ProjectTypeBadge`, `StatCard`, `CrossSectionSVG`, `UploadModal`, `ShareModal`
- Exporta tudo como named exports (aguardando Parte 2 para o componente principal)

O JSX sera reconstruido com tags correctas mantendo a mesma estrutura visual.

### 4. Rota em `src/App.tsx`

Adicionar dentro das rotas `/app`:
```
<Route path="incompaticheck" element={<IncompatiCheck />} />
```

### 5. Sidebar em `src/components/layout/AppSidebar.tsx`

Adicionar novo item no grupo principal (ou num grupo dedicado) com:
- Icone: `Search` do lucide-react (equivalente ao magnifying glass)
- Label: "Analise de Incompatibilidades"  
- URL: `/app/incompaticheck`
- Badge laranja com texto "Novo"

---

## Detalhes Tecnicos

### Migracao SQL

```sql
CREATE TABLE incompaticheck_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  format TEXT NOT NULL,
  file_url TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE incompaticheck_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_ids UUID[],
  status TEXT DEFAULT 'pending',
  results JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE incompaticheck_findings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID REFERENCES incompaticheck_analyses(id),
  severity TEXT,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  tags TEXT[],
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE incompaticheck_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID REFERENCES incompaticheck_analyses(id),
  user_id UUID NOT NULL,
  pdf_url TEXT,
  shared_via TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE incompaticheck_chat (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  analysis_id UUID REFERENCES incompaticheck_analyses(id),
  role TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE incompaticheck_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE incompaticheck_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE incompaticheck_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE incompaticheck_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE incompaticheck_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own projects" ON incompaticheck_projects FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own analyses" ON incompaticheck_analyses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users view own findings" ON incompaticheck_findings FOR ALL USING (
  EXISTS (SELECT 1 FROM incompaticheck_analyses a WHERE a.id = incompaticheck_findings.analysis_id AND a.user_id = auth.uid())
);
CREATE POLICY "Users manage own reports" ON incompaticheck_reports FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own chat" ON incompaticheck_chat FOR ALL USING (auth.uid() = user_id);
```

### Sidebar -- novo item

Adicionado entre os `mainItems` e o grupo "Fase 2", num grupo proprio "Ferramentas" ou directamente no menu principal, com badge laranja "Novo".

### Ficheiros modificados

| Ficheiro | Alteracao |
|---|---|
| `src/pages/app/IncompatiCheck.tsx` | Novo -- componentes Parte 1 |
| `src/App.tsx` | Nova rota `incompaticheck` |
| `src/components/layout/AppSidebar.tsx` | Novo item no menu |

