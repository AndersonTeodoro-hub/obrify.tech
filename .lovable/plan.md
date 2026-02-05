
# Plano: Sistema de Alertas Baseado em Analises IA

## Resumo
Implementar um sistema de alertas automaticos que notifica utilizadores quando analises IA detectam problemas criticos. Inclui nova tabela de alertas, componente AlertBell no header, dropdown de alertas, e integracao com a Edge Function existente.

---

## Analise do Estado Actual

### Edge Function ai-image-analysis:
- Ja guarda deteccoes em `ai_analysis_results`
- Retorna severidade: critical, major, minor, observation
- Local ideal para criar alertas automaticos

### AppHeader.tsx:
- Header simples com breadcrumbs e toggles
- Espaco disponivel para AlertBell junto aos toggles

### Tabelas existentes:
- `ai_analysis_results` - resultados de analise
- `captures` - capturas com file_path

---

## Alteracoes Necessarias

### 1. Nova Tabela: alerts

```sql
CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'ai_detection',
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  related_capture_id uuid REFERENCES public.captures(id) ON DELETE CASCADE,
  related_site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts" ON public.alerts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own alerts" ON public.alerts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "System can create alerts" ON public.alerts
  FOR INSERT WITH CHECK (true);
```

### 2. Modificar Edge Function ai-image-analysis

Apos guardar deteccoes, criar alertas para severidades critical/major:

```text
// Apos inserir em ai_analysis_results
const criticalDetections = analysisResult.detections.filter(
  d => d.severity === 'critical' || d.severity === 'major'
);

if (criticalDetections.length > 0) {
  // Buscar membros da organizacao
  const { data: site } = await supabase
    .from('sites')
    .select('org_id')
    .eq('id', siteId)
    .single();

  const { data: members } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('org_id', site.org_id);

  // Criar alerta para cada membro
  for (const detection of criticalDetections) {
    const alertInserts = members.map(m => ({
      type: 'ai_detection',
      message: `${detection.type}: ${detection.description}`,
      severity: detection.severity,
      related_capture_id: capture_id,
      related_site_id: siteId,
      user_id: m.user_id,
    }));

    await supabase.from('alerts').insert(alertInserts);
  }
}
```

---

## Novos Componentes

### 3. AlertBell.tsx

Componente do header com contador de alertas nao lidos:

```text
AlertBell.tsx
├── Estado: unreadCount (realtime)
├── Icone Bell com badge contador
├── Dropdown ao clicar:
│   ├── Header "Alertas" + Botao "Marcar todos como lidos"
│   ├── ScrollArea com lista de alertas recentes
│   │   ├── Cada alerta:
│   │   │   ├── Badge severidade (cor)
│   │   │   ├── Mensagem truncada
│   │   │   ├── Tempo relativo (ha 2 min)
│   │   │   ├── Botao "Ver" -> navega para captura
│   │   │   └── Botao "Criar NC" (se critical/major)
│   │   └── Indicador de nao lido (circulo)
│   └── Footer "Ver todos os alertas"
└── Realtime subscription para updates
```

### Estrutura Visual do Dropdown:

```text
┌─────────────────────────────────────┐
│  🔔 Alertas (3)    [Marcar lidas]  │
├─────────────────────────────────────┤
│  🔴 Fissura detectada               │
│     Obra Centro - há 2 min    [Ver] │
│  ●                                  │
├─────────────────────────────────────┤
│  🟠 Armadura exposta                │
│     Obra Norte - há 15 min    [Ver] │
│  ●                                  │
├─────────────────────────────────────┤
│  🟠 Segregacao betao                │
│     Obra Sul - há 1 hora      [Ver] │
│                                     │
├─────────────────────────────────────┤
│       Ver todos os alertas →        │
└─────────────────────────────────────┘
```

---

## Ficheiros a Criar/Modificar

| Ficheiro | Accao |
|----------|-------|
| Migracao SQL | Criar tabela alerts |
| supabase/functions/ai-image-analysis/index.ts | Adicionar criacao de alertas |
| src/components/layout/AlertBell.tsx | Criar componente |
| src/components/layout/AppHeader.tsx | Adicionar AlertBell |
| src/pages/app/Alerts.tsx | Pagina completa de alertas (opcional) |
| src/i18n/locales/pt.json | Adicionar traducoes |
| src/i18n/locales/en.json | Adicionar traducoes |

---

## Logica do AlertBell

### Query de alertas:

```typescript
const { data: alerts } = await supabase
  .from('alerts')
  .select(`
    *,
    capture:captures(
      id,
      file_path,
      capture_point:capture_points(
        code,
        area:areas(
          name,
          floor:floors(
            name,
            site:sites(id, name)
          )
        )
      )
    )
  `)
  .eq('user_id', user.id)
  .order('created_at', { ascending: false })
  .limit(10);
```

### Contador em tempo real:

```typescript
// Contar nao lidos
const { count } = await supabase
  .from('alerts')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', user.id)
  .eq('read', false);

// Subscription para updates
const channel = supabase
  .channel('alerts')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'alerts',
    filter: `user_id=eq.${user.id}`,
  }, (payload) => {
    // Incrementar contador e adicionar a lista
    setUnreadCount(prev => prev + 1);
    setAlerts(prev => [payload.new, ...prev].slice(0, 10));
  })
  .subscribe();
```

### Marcar como lido:

```typescript
const markAsRead = async (alertId: string) => {
  await supabase
    .from('alerts')
    .update({ read: true })
    .eq('id', alertId);
};

const markAllAsRead = async () => {
  await supabase
    .from('alerts')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false);
};
```

### Navegacao para captura:

```typescript
const handleViewCapture = (alert: Alert) => {
  markAsRead(alert.id);
  const site = alert.capture?.capture_point?.area?.floor?.site;
  if (site) {
    navigate(`/app/sites/${site.id}?tab=captures&capture=${alert.related_capture_id}`);
  }
};
```

---

## Modificar Edge Function

Adicionar ao final do handler, antes do return:

```typescript
// Criar alertas para deteccoes criticas/importantes
const alertDetections = analysisResult.detections.filter(
  d => d.severity === 'critical' || d.severity === 'major'
);

if (alertDetections.length > 0) {
  try {
    // Buscar org_id do site
    const { data: site } = await supabase
      .from('sites')
      .select('org_id')
      .eq('id', siteId)
      .single();

    if (site?.org_id) {
      // Buscar todos os membros da org
      const { data: members } = await supabase
        .from('memberships')
        .select('user_id')
        .eq('org_id', site.org_id);

      if (members && members.length > 0) {
        const alertInserts = [];
        
        for (const detection of alertDetections) {
          for (const member of members) {
            alertInserts.push({
              type: 'ai_detection',
              message: `${detection.type}: ${detection.description.slice(0, 100)}`,
              severity: detection.severity,
              related_capture_id: capture_id,
              related_site_id: siteId,
              user_id: member.user_id,
            });
          }
        }

        await supabase.from('alerts').insert(alertInserts);
      }
    }
  } catch (alertError) {
    // Log mas nao falhar o request principal
    console.error('Failed to create alerts:', alertError);
  }
}
```

---

## Modificar AppHeader

Adicionar AlertBell antes dos toggles:

```tsx
<div className="flex items-center gap-2">
  <AlertBell />
  <LanguageSwitcher />
  <ThemeToggle />
</div>
```

---

## Traducoes

### Portugues (pt.json):

```json
"alerts": {
  "title": "Alertas",
  "markAllRead": "Marcar todas como lidas",
  "viewAll": "Ver todos os alertas",
  "noAlerts": "Sem alertas",
  "noAlertsDesc": "Nao tem alertas por ler",
  "unread": "{{count}} nao lido(s)",
  "viewCapture": "Ver Captura",
  "createNC": "Criar NC",
  "markRead": "Marcar como lida",
  "timeAgo": {
    "justNow": "Agora mesmo",
    "minutes": "ha {{count}} min",
    "hours": "ha {{count}} hora(s)",
    "days": "ha {{count}} dia(s)"
  },
  "types": {
    "ai_detection": "Deteccao IA"
  }
}
```

### Ingles (en.json):

```json
"alerts": {
  "title": "Alerts",
  "markAllRead": "Mark all as read",
  "viewAll": "View all alerts",
  "noAlerts": "No alerts",
  "noAlertsDesc": "You have no unread alerts",
  "unread": "{{count}} unread",
  "viewCapture": "View Capture",
  "createNC": "Create NC",
  "markRead": "Mark as read",
  "timeAgo": {
    "justNow": "Just now",
    "minutes": "{{count}} min ago",
    "hours": "{{count}} hour(s) ago",
    "days": "{{count}} day(s) ago"
  },
  "types": {
    "ai_detection": "AI Detection"
  }
}
```

---

## Fluxo de Utilizacao

```text
1. Utilizador analisa captura com IA
       │
       ▼
2. Edge Function detecta problema critico
       │
       ▼
3. Alerta criado para todos os membros da org
       │
       ▼
4. Badge no AlertBell actualiza (realtime)
       │
       ▼
5. Utilizador clica no sino
       │
       ▼
6. Ve lista de alertas recentes
       │
       ▼
7. Clica "Ver" -> navega para captura
   OU clica "Criar NC" -> abre modal pre-preenchido
       │
       ▼
8. Alerta marcado como lido
```

---

## Notificacoes Push (Futuro)

A infraestrutura de alertas permite adicionar notificacoes push posteriormente:
- Registar service worker
- Guardar push subscription na BD
- Enviar notificacao quando alerta e criado (Edge Function)

Este requisito fica preparado mas nao implementado nesta fase (requer setup adicional de service worker).

---

## RLS Policies

```sql
-- Utilizadores podem ver os seus proprios alertas
CREATE POLICY "Users can view own alerts" ON public.alerts
  FOR SELECT USING (auth.uid() = user_id);

-- Utilizadores podem actualizar os seus proprios alertas (marcar como lido)
CREATE POLICY "Users can update own alerts" ON public.alerts
  FOR UPDATE USING (auth.uid() = user_id);

-- Sistema pode criar alertas (via service role na Edge Function)
CREATE POLICY "Service role can insert alerts" ON public.alerts
  FOR INSERT WITH CHECK (true);
```

---

## Resumo das Alteracoes

1. **Migracao SQL**: Criar tabela `alerts` com RLS e enable realtime
2. **Edge Function**: Adicionar logica de criacao de alertas para deteccoes criticas
3. **AlertBell.tsx**: Componente com contador, dropdown, e realtime subscription
4. **AppHeader.tsx**: Integrar AlertBell
5. **Traducoes**: Novas chaves para PT e EN

---

## Consideracoes Tecnicas

1. **Realtime**: Usar Supabase realtime para updates instantaneos
2. **Performance**: Limitar a 10 alertas no dropdown, paginacao na pagina completa
3. **Cleanup**: Alertas antigos podem ser limpos via cron job (futuro)
4. **Membros**: Alertas criados para todos os membros da org do site
5. **Fallback**: Se falhar criacao de alertas, nao afecta a analise principal
