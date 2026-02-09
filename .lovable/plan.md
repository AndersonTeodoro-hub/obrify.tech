

# Plano: Rebranding Completo + Notificacoes + Upload Mobile

## Diagnostico

Verifiquei os 3 problemas em detalhe:

### 1. "SitePulse" ainda aparece em varios sitios
Encontrei **167 referencias a "SitePulse"** espalhadas por 13 ficheiros:
- **4 ficheiros de traducao** (pt.json, en.json, es.json, fr.json) - textos como "Bem-vindo ao SitePulse", "brand.name: SitePulse"
- **src/index.css** - comentarios e classes CSS `.sitepulse-tour-popover`
- **src/App.tsx** - `storageKey="sitepulse-theme"`
- **src/i18n/index.ts** - `lookupLocalStorage: 'sitepulse-language'`
- **src/components/theme-provider.tsx** - `storageKey = "sitepulse-theme"`
- **src/services/pdfGenerator.ts** - `'Fiscalizacao', 'SitePulse'` nos PDFs
- **supabase/migrations/** - comentarios no SQL

### 2. Notificacoes nao funcionam
O sistema de alertas tem:
- Tabela `alerts` criada e funcional no banco de dados (com colunas id, type, message, severity, related_capture_id, related_site_id, user_id, read, created_at)
- Componente `AlertBell` implementado e montado no header
- Subscricao Realtime configurada
- **PROBLEMA**: A tabela `alerts` esta VAZIA (0 registos). Os alertas so sao criados em 2 sitios: `ai-image-analysis` e `ai-compare-projects` (edge functions). Nao ha trigger automatico que crie alertas quando ha eventos importantes como novas NCs, inspeccoes falhadas, etc.
- **SOLUCAO**: Criar um trigger na base de dados que gere alertas automaticamente quando: uma NC e criada, uma inspecao e completada, uma captura com severidade critica/major e detectada pela IA.

### 3. Upload automatico para smartphone (360 e manual)
O sistema actual (`NewCaptureModal`) so permite upload por **drag-and-drop ou seleccao de ficheiros** - nao existe nenhuma funcionalidade de captura directa da camara do telemovel. Falta:
- Botao para abrir a camara nativa do smartphone
- Suporte para captura directa usando `navigator.mediaDevices` ou `<input type="file" capture="environment">`
- Fluxo simplificado para captura rapida em campo

---

## O Que Vai Ser Feito

### Parte 1: Substituir todas as referencias "SitePulse" por "Obrify"

| Ficheiro | Alteracoes |
|----------|------------|
| `src/i18n/locales/pt.json` | ~25 referencias: brand.name, welcome, onboarding, auth |
| `src/i18n/locales/en.json` | ~25 referencias |
| `src/i18n/locales/es.json` | ~25 referencias |
| `src/i18n/locales/fr.json` | ~25 referencias |
| `src/index.css` | Comentarios e classes CSS `.sitepulse-tour-*` para `.obrify-tour-*` |
| `src/App.tsx` | `storageKey` de `sitepulse-theme` para `obrify-theme` |
| `src/i18n/index.ts` | localStorage key de `sitepulse-language` para `obrify-language` |
| `src/components/theme-provider.tsx` | storageKey default |
| `src/services/pdfGenerator.ts` | Nome da fiscalizacao nos PDFs |
| `src/components/onboarding/ProductTour.tsx` | Classe CSS do tour popover |

### Parte 2: Activar notificacoes automaticas

Criar um **database trigger** que insere alertas automaticamente:

- **Trigger em `nonconformities`**: Quando uma NC e criada, gera um alerta para todos os membros da organizacao com a severidade da NC
- **Trigger em `inspections`**: Quando uma inspecao muda de status (ex: completa), notifica os membros
- **Funcao de database** `notify_org_members()` que identifica todos os users da organizacao e cria alertas para cada um
- Activar **Realtime** na tabela `alerts` (se nao estiver ja activo)

### Parte 3: Captura directa da camara do smartphone

Adicionar ao `NewCaptureModal` e criar um novo componente `SmartCapture`:

- **Botao "Tirar Foto"** que usa `<input type="file" accept="image/*" capture="environment">` para abrir a camara traseira
- **Botao "Foto 360"** que usa o mesmo mecanismo para panoramas
- Deteccao automatica de dispositivo mobile (`use-mobile` hook ja existe)
- Em mobile, mostrar os botoes de captura directa como opcao principal
- Em desktop, manter o drag-and-drop como esta

---

## Detalhes Tecnicos

### Trigger de Notificacoes (SQL)

A funcao `notify_org_members` vai:
1. Receber o evento (INSERT em nonconformities)
2. Encontrar o `site_id` associado
3. Encontrar o `org_id` do site
4. Buscar todos os `user_id` dos membros dessa organizacao
5. Inserir um alerta para cada membro com a mensagem, severidade e links relevantes

### Captura Mobile

Usar a API nativa do HTML5 `<input capture>` que e suportada em todos os smartphones modernos:
- `capture="environment"` abre a camara traseira
- `accept="image/*"` limita a imagens
- Nao precisa de permissoes especiais nem APIs complexas
- Funciona tanto em iOS Safari como Android Chrome
- Apos captura, o ficheiro segue o mesmo fluxo de upload existente

### Ficheiros a criar/modificar

| Ficheiro | Tipo | Descricao |
|----------|------|-----------|
| Migracao SQL | Novo | Trigger + funcao para alertas automaticos |
| `src/components/captures/SmartCaptureButtons.tsx` | Novo | Botoes de captura directa para mobile |
| `src/components/captures/NewCaptureModal.tsx` | Modificar | Integrar botoes de captura mobile |
| 10 ficheiros de rebranding | Modificar | Substituir SitePulse por Obrify |

