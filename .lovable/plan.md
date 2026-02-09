

# Auditoria Completa da Aplicacao Obrify - Situacao Real

## Resumo Executivo

Apos uma varredura completa do codigo e da infraestrutura, identifiquei o estado real de cada funcionalidade. A aplicacao tem uma base solida mas existem problemas concretos que precisam de atencao.

---

## 1. PAGINA DE AUTENTICACAO (/auth)

| Funcionalidade | Estado | Observacao |
|---|---|---|
| Login com email/password | FUNCIONAL | Integrado com backend auth |
| Registo (signup) | FUNCIONAL | Validacao de password minima 6 chars |
| Toggle mostrar password | FUNCIONAL | Icone olho funciona |
| "Lembrar-me" (checkbox) | FUNCIONAL | Salva email no localStorage |
| "Esqueci a password" | FUNCIONAL | Envia email de reset via backend |
| Login com Google OAuth | FUNCIONAL | Usa Lovable Cloud auth |
| Alternar Login/Registo | FUNCIONAL | Botoes de troca funcionam |
| Botao de Partilha | FUNCIONAL | Web Share API + fallback clipboard |
| Troca de idioma | FUNCIONAL | PT, EN, ES, FR |
| Toggle de tema (dark/light) | FUNCIONAL (com warning) | Funciona mas tem warning de ref no console |

**PROBLEMA**: Warning no console - `Function components cannot be given refs` no ThemeToggle e DialogContent. Nao impede o uso mas e ma pratica.

---

## 2. DASHBOARD (/app)

| Funcionalidade | Estado | Observacao |
|---|---|---|
| Estatisticas (4 cards) | FUNCIONAL | Sites, Capturas, Inspecoes, NCs |
| Obras recentes (lista) | FUNCIONAL | Click navega para detalhe |
| Acoes rapidas | FUNCIONAL | Navegam para as paginas corretas |
| Componente SitesWithNCs | FUNCIONAL | Mostra obras com NCs abertas |
| Estado vazio (sem org) | FUNCIONAL | Mostra botao criar organizacao |

**PROBLEMA POTENCIAL**: As queries de stats (capturas, inspecoes, NCs) NAO filtram por `org_id` - contam TODOS os registos da base de dados, nao apenas os da organizacao do utilizador. Isto pode mostrar numeros errados se houver dados de outros utilizadores.

---

## 3. ORGANIZACOES (/app/organizations)

| Funcionalidade | Estado | Observacao |
|---|---|---|
| Listar organizacoes | FUNCIONAL | Mostra com role e contagem de membros |
| Criar organizacao | FUNCIONAL | Cria org + membership como admin |
| Editar organizacao | FUNCIONAL | So admins veem o botao |
| Eliminar organizacao | FUNCIONAL | So admins veem o botao |

**PROBLEMA**: Eliminar organizacao NAO pede confirmacao - executa `deleteSiteMutation.mutate()` directamente. Se o utilizador clicar por engano, a organizacao e eliminada sem aviso.

---

## 4. OBRAS (/app/sites)

| Funcionalidade | Estado | Observacao |
|---|---|---|
| Listar obras | FUNCIONAL | Cards com imagem, morada, status |
| Criar obra | FUNCIONAL | Com selecao de org, upload de imagem |
| Editar obra | FUNCIONAL | Modal dedicado (EditSiteModal) |
| Eliminar obra | PROBLEMA | Sem confirmacao - executa directamente |
| Navegar para detalhe | FUNCIONAL | Click no card |
| Upload de imagem da obra | FUNCIONAL | Usa bucket `site-images` (publico) |

**PROBLEMA**: Eliminar obra tambem NAO pede confirmacao.

---

## 5. DETALHE DE OBRA (/app/sites/:id)

| Funcionalidade | Estado | Observacao |
|---|---|---|
| Tab Visao Geral | FUNCIONAL | SiteOverviewTab |
| Tab Estrutura (Pisos/Areas/Pontos) | FUNCIONAL | SiteStructureTab |
| Tab Capturas | FUNCIONAL | SiteCapturesTab |
| Tab Inspecoes | FUNCIONAL | SiteInspectionsTab |
| Tab Documentos | FUNCIONAL | SiteDocumentsTab |
| Tab Projectos | FUNCIONAL | SiteProjectsTab + upload/analise IA |
| Editar obra | FUNCIONAL | EditSiteModal |

---

## 6. CAPTURAS (/app/captures)

| Funcionalidade | Estado | Observacao |
|---|---|---|
| Listar capturas | FUNCIONAL | Grid com cards |
| Filtros (obra, piso, tipo) | FUNCIONAL | CaptureFilters |
| Nova captura (modal) | FUNCIONAL | Upload de ficheiros |
| Smart Capture (mobile) | FUNCIONAL | Usa `capture="environment"` |
| Viewer de captura | FUNCIONAL | CaptureViewer com navegacao |
| Analise IA de imagem | FUNCIONAL | Edge function `ai-image-analysis` |

**PROBLEMA**: A captura requer que existam Pontos de Captura pre-criados na estrutura da obra. Se o utilizador nao criou a hierarquia (Piso > Area > Ponto), nao consegue fazer upload de capturas. Isto NAO e explicado claramente na interface.

---

## 7. INSPECOES (/app/inspections)

| Funcionalidade | Estado | Observacao |
|---|---|---|
| Listar inspecoes | FUNCIONAL | Tabela com filtros |
| Filtros (obra, status, data) | FUNCIONAL | 3 filtros combinaveis |
| Criar inspecao (wizard) | FUNCIONAL | NewInspectionWizard |
| Ver detalhe de inspecao | FUNCIONAL | Navega para /inspections/:id |
| Checklist items | FUNCIONAL | ChecklistItem com conformidade |

**PROBLEMA POTENCIAL**: A query de inspecoes usa `!inner` join com `sites` e `inspection_templates`, o que significa que inspecoes sem template ou sem obra associada sao excluidas silenciosamente.

---

## 8. NAO-CONFORMIDADES (/app/nonconformities)

| Funcionalidade | Estado | Observacao |
|---|---|---|
| Listar NCs | FUNCIONAL | Tabela com severidade colorida |
| Filtros (obra, severidade, status) | FUNCIONAL | 3 filtros |
| Ver detalhe (sheet lateral) | FUNCIONAL | NCDetailSheet |
| Exportar CSV | FUNCIONAL | Gera ficheiro CSV com BOM UTF-8 |
| Timeline de status | FUNCIONAL | NCStatusTimeline |
| Galeria de evidencias | FUNCIONAL | NCEvidenceGallery |

**PROBLEMA NO FILTRO**: O filtro de severidade so mostra Critical, High, Medium - falta a opcao "Low". NCs com severidade "low" nao podem ser filtradas.

---

## 9. RELATORIOS (/app/reports)

| Funcionalidade | Estado | Observacao |
|---|---|---|
| Relatorios de inspecao (PDF) | FUNCIONAL | Gera e faz download |
| Lista NCs abertas (PDF) | FUNCIONAL | Por obra |
| Historico NCs (PDF) | FUNCIONAL | Por periodo |
| Historico de relatorios | FUNCIONAL | Lista com download |
| Armazenamento no backend | FUNCIONAL | Bucket `documents` |

---

## 10. DRONES (/app/drone)

| Funcionalidade | Estado | Observacao |
|---|---|---|
| Registar drone | FUNCIONAL | DroneFormModal |
| Listar drones | FUNCIONAL | Com status e horas |
| Editar drone | FUNCIONAL | Reutiliza DroneFormModal |
| Eliminar drone | FUNCIONAL | Com confirmacao (AlertDialog) |
| Missoes de drone | FUNCIONAL | Lista de missoes |
| AI Chat (Agente Fiscal) | DEPENDE | Requer edge function funcional |

---

## 11. DEFINICOES (/app/settings)

| Funcionalidade | Estado | Observacao |
|---|---|---|
| Perfil (nome) | FUNCIONAL | Editar e guardar |
| Upload avatar | FUNCIONAL | Usa bucket `site-images` |
| Tema (light/dark/system) | FUNCIONAL | 3 opcoes |
| Idioma | FUNCIONAL | 4 idiomas |
| Templates de inspecao | FUNCIONAL | Navega para pagina dedicada |
| Tab Equipa | FUNCIONAL | TeamTab com convites |
| Notificacoes | NAO IMPLEMENTADO | Mostra "Em breve" |

---

## 12. BARRA DE PESQUISA (Header)

| Funcionalidade | Estado | Observacao |
|---|---|---|
| Campo de pesquisa | NAO FUNCIONAL | E apenas um input visual sem logica |

**PROBLEMA CRITICO**: A barra de pesquisa no header e puramente decorativa. Nao tem nenhum `onChange` handler, nenhuma logica de pesquisa, nenhum estado. O utilizador pode escrever mas nada acontece.

---

## 13. SINO DE ALERTAS (AlertBell)

| Funcionalidade | Estado | Observacao |
|---|---|---|
| Listar alertas | FUNCIONAL | Busca da tabela `alerts` |
| Contagem nao-lidos | FUNCIONAL | Badge com contador |
| Marcar como lido | FUNCIONAL | Individual e todos |
| Realtime (novos alertas) | FUNCIONAL | Subscricao postgres_changes |
| Navegar para captura | FUNCIONAL | Link directo |

---

## 14. OBRIFY AGENT (Assistente IA)

| Funcionalidade | Estado | Observacao |
|---|---|---|
| Abrir/fechar (FAB button) | FUNCIONAL | Botao fixo canto inferior direito |
| Chat com IA | DEPENDE | Requer creditos do Lovable AI Gateway |
| Modo Especialista | FUNCIONAL | Toggle com prompt diferente |
| Voz (TTS/STT) | DEPENDE | Requer ELEVENLABS_API_KEY configurada |
| Historico de conversas | FUNCIONAL | Persistido no backend |
| Sugestoes contextuais | FUNCIONAL | Baseadas na pagina actual |
| Atalho de teclado | FUNCIONAL | Toggle do agent |

---

## 15. EDGE FUNCTIONS

| Funcao | Estado | Observacao |
|---|---|---|
| ai-fiscal-agent | FUNCIONAL | Streaming chat com Lovable AI |
| ai-obrify-agent | FUNCIONAL | Agent com tools (queries DB) |
| ai-image-analysis | DEPENDE | Precisa de verificacao |
| ai-analyze-project | DEPENDE | Chamada pelo agent |
| ai-compare-projects | DEPENDE | Chamada pelo agent |
| elevenlabs-tts | DEPENDE | Requer ELEVENLABS_API_KEY |
| elevenlabs-stt-token | DEPENDE | Requer ELEVENLABS_API_KEY |

**NOTA**: verify_jwt esta desactivado para TODAS as edge functions. Isto significa que qualquer pessoa pode chamar estas funcoes sem autenticacao.

---

## 16. PREVIEW DE LINK PARTILHADO (OG Tags)

| Funcionalidade | Estado | Observacao |
|---|---|---|
| Meta tags OG | CONFIGURADO | og:title, og:description, og:image, og:url |
| Twitter cards | CONFIGURADO | summary_large_image |
| Imagem do logo | DISPONIVEL | URL publica no bucket brand-assets |

**NOTA**: A imagem OG tem dimensoes declaradas 1200x630 mas o logo real e quadrado. Algumas plataformas podem nao exibir correctamente uma imagem quadrada quando as dimensoes declaradas sao rectangulares. Isto pode ser a causa do problema que reportou.

---

## RESUMO DOS PROBLEMAS IDENTIFICADOS

### Criticos (afectam utilizadores)

1. **Barra de pesquisa nao funciona** - E puramente visual, sem nenhuma logica
2. **Eliminar obra/organizacao sem confirmacao** - Click acidental elimina dados permanentemente
3. **Stats do dashboard nao filtram por organizacao** - Capturas e inspecoes contam dados globais
4. **OG Image dimensoes incorrectas** - Logo quadrado declarado como 1200x630

### Importantes

5. **Filtro de severidade NC incompleto** - Falta opcao "Low"
6. **Capturas requerem hierarquia pre-criada** - Sem feedback claro ao utilizador
7. **Edge functions sem JWT** - Qualquer pessoa pode chamar as APIs
8. **Warnings de React refs** - ThemeToggle e Dialog com warnings no console

### Menores

9. **Notificacoes nas Settings** - Marcado como "Em breve"
10. **Texto hardcoded em portugues** - Alguns textos no Drone e Agent nao usam i18n

---

## Detalhes Tecnicos do Plano de Correcao

### 1. Barra de pesquisa
- Adicionar estado `searchQuery` e handler `onChange`
- Implementar pesquisa global (obras, capturas, NCs) com debounce
- Mostrar dropdown de resultados

### 2. Confirmacao ao eliminar
- Adicionar `AlertDialog` antes de eliminar obra (em `Sites.tsx`)
- Adicionar `AlertDialog` antes de eliminar organizacao (em `Organizations.tsx`)

### 3. Stats do dashboard
- Filtrar queries de capturas, inspecoes e NCs por `org_id` ou por `site_id` das obras do utilizador

### 4. OG Image
- Alterar `og:image:width` e `og:image:height` para dimensoes reais do logo, ou criar uma imagem banner 1200x630 dedicada

### 5. Filtro severidade NC
- Adicionar `<SelectItem value="low">` ao filtro

### 6. Edge functions JWT
- Considerar activar `verify_jwt = true` para funcoes sensiveis

