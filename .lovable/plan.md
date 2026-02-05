

# Plano Completo: Sistema Autonomo de Fiscalizacao com Drone + IA

## Visao Geral do Sistema Desejado

```
Tecnico Fiscal (comando) 
        ↓
   IA Agente Senior (interpreta pedido)
        ↓
   Planeia Missao (coordenadas do projeto)
        ↓
   Drone Executa (voo automatico)
        ↓
   Captura Imagens/Video (cada ponto)
        ↓
   Upload Automatico (para plataforma)
        ↓
   IA Analisa (visao computacional)
        ↓
   Gera Relatorios/Fichas/Mapas (automatico)
```

---

## FASE 1: Infraestrutura de Dados (Backend)

### 1.1 Novas Tabelas Necessarias

**Tabela `project_coordinates`** - Coordenadas GPS do projeto
- Pontos de medicao pre-definidos pela IA
- Ligacao a capture_points existentes
- Altitude de voo para cada ponto

**Tabela `drones`** - Registo de equipamentos
- Serial number, modelo, estado
- Ligacao a organizacao

**Tabela `drone_missions`** - Missoes de voo
- Waypoints (lista de coordenadas)
- Tipo de missao (medicao, inspecao, timelapse)
- Estado (planeada, em execucao, concluida)

**Tabela `ai_analysis_results`** - Resultados da IA
- Captura analisada
- Deteccoes (defeitos, medicoes)
- Confianca da analise

**Tabela `ai_reports`** - Relatorios gerados
- Tipo (auto medicao, ficha, mapa)
- Conteudo estruturado (JSON)
- PDF gerado

### 1.2 Novos Enums
- `mission_type`: medicao, inspecao_visual, mapeamento_3d, timelapse
- `mission_status`: draft, planned, executing, completed, failed
- `ai_detection_type`: fissura, humidade, desalinhamento, medicao

---

## FASE 2: Agente IA de Fiscalizacao

### 2.1 Edge Function `ai-fiscal-agent`
Agente conversacional que:
- Recebe comandos do tecnico fiscal
- Interpreta o pedido (ex: "fazer auto de medicao do bloco A")
- Consulta o projeto para obter coordenadas
- Cria missao de drone automaticamente
- Responde com plano de acao

### 2.2 Capacidades do Agente
```
Comandos suportados:
- "Fazer auto de medicao [zona]"
- "Inspecionar fachada [orientacao]"
- "Verificar progresso [area]"
- "Gerar relatorio semanal"
- "Comparar com captura anterior"
```

### 2.3 Base de Conhecimento
- Regulamentos de fiscalizacao portugueses
- Templates de autos de medicao
- Checklists de inspecao por especialidade
- Normas tecnicas (betao, estruturas, etc.)

---

## FASE 3: Integracao com Drone

### 3.1 App Nativa (Capacitor + DJI SDK)
- Conexao bluetooth/wifi com drone
- Envio de missoes waypoint
- Recepcao de telemetria em tempo real
- Controlo de camera (foto/video)
- Upload automatico quando aterra

### 3.2 Edge Function `drone-mission-executor`
- Recebe missao da IA
- Converte para formato DJI waypoint
- Envia para app nativa via websocket
- Monitoriza progresso em tempo real

### 3.3 Edge Function `drone-upload-handler`
- Recebe ficheiros do drone
- Valida metadados GPS
- Associa a pontos de captura
- Inicia processamento IA

---

## FASE 4: Analise por Visao Computacional

### 4.1 Edge Function `ai-image-analysis`
Usando Lovable AI (Gemini Vision):
- Recebe imagem/frame de video
- Analisa para deteccao de:
  - Fissuras e defeitos
  - Medicoes visuais
  - Estado de execucao
  - Comparacao temporal

### 4.2 Edge Function `ai-measurement-extraction`
- Extrai medicoes de imagens calibradas
- Calcula areas e volumes
- Compara com projeto original

### 4.3 Edge Function `ai-defect-detection`
- Classifica tipo de defeito
- Avalia gravidade
- Sugere accao correctiva

---

## FASE 5: Geracao Automatica de Documentos

### 5.1 Edge Function `generate-auto-medicao`
- Recebe dados das analises
- Preenche template de auto de medicao
- Gera PDF formatado
- Guarda no storage

### 5.2 Edge Function `generate-inspection-report`
- Compila todas as nao-conformidades
- Gera relatorio de fiscalizacao
- Inclui imagens anotadas
- Exporta PDF profissional

### 5.3 Edge Function `generate-progress-map`
- Cria mapa de progresso da obra
- Overlay de capturas no projeto
- Indica zonas inspecionadas
- Marca nao-conformidades

---

## FASE 6: Interface do Utilizador

### 6.1 Chat com Agente IA
- Interface conversacional na app
- Comandos por texto ou voz
- Feedback em tempo real
- Historico de interaccoes

### 6.2 Dashboard de Missoes
- Lista de missoes planeadas
- Mapa com waypoints
- Estado em tempo real
- Replay de voos anteriores

### 6.3 Visualizador de Analises
- Imagens com anotacoes IA
- Comparacao antes/depois
- Timeline de evolucao
- Exportar evidencias

### 6.4 Biblioteca de Relatorios
- Todos os documentos gerados
- Pesquisa e filtros
- Download individual ou em lote
- Partilha com stakeholders

---

## Arquitectura Tecnica

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React/Capacitor)               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Chat IA  │  │ Missoes  │  │ Analises │  │Relatorios│    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
└───────┼─────────────┼─────────────┼─────────────┼──────────┘
        │             │             │             │
        ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────┐
│                    EDGE FUNCTIONS                           │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐│
│  │ai-fiscal   │  │drone-      │  │ai-image-analysis      ││
│  │-agent      │  │mission     │  │ai-measurement         ││
│  │            │  │-executor   │  │ai-defect-detection    ││
│  └─────┬──────┘  └─────┬──────┘  └──────────┬─────────────┘│
│        │               │                    │              │
│        ▼               ▼                    ▼              │
│  ┌────────────────────────────────────────────────────────┐│
│  │              LOVABLE AI GATEWAY                        ││
│  │         (Gemini Vision / GPT-5)                        ││
│  └────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Tables   │  │ Storage  │  │ Realtime │  │  Auth    │    │
│  │(missoes, │  │(imagens, │  │(teleme-  │  │(users)   │    │
│  │ analises)│  │ videos)  │  │  tria)   │  │          │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│              APP NATIVA (iOS/Android)                       │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │    DJI SDK       │  │   Insta360 SDK   │                │
│  │ (controlo drone) │  │ (camera 360)     │                │
│  └──────────────────┘  └──────────────────┘                │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                    HARDWARE                                 │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │  DJI Mavic 3     │  │   Insta360 X4    │                │
│  │  Enterprise      │  │   + Tripe 360    │                │
│  └──────────────────┘  └──────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

---

## Cronograma Estimado

| Fase | Descricao | Duracao Estimada |
|------|-----------|------------------|
| 1 | Infraestrutura de dados | 1-2 semanas |
| 2 | Agente IA de fiscalizacao | 2-3 semanas |
| 3 | Integracao drone (SDK nativo) | 3-4 semanas |
| 4 | Analise por visao computacional | 2-3 semanas |
| 5 | Geracao automatica de documentos | 2 semanas |
| 6 | Interface completa | 2-3 semanas |
| **TOTAL** | | **12-17 semanas** |

---

## Proximos Passos Imediatos

### Passo 1: Criar tabelas de coordenadas e missoes
Adicionar ao backend as estruturas para armazenar coordenadas GPS do projeto e missoes de drone.

### Passo 2: Criar Agente IA basico
Edge function que interpreta comandos do tecnico e planeia missoes usando Lovable AI.

### Passo 3: Interface de chat com Agente
Componente de chat na app para interagir com o agente de fiscalizacao.

### Passo 4: Configurar Capacitor
Preparar a app para compilacao nativa (necessario para integrar SDKs de hardware).

---

## Notas Importantes

1. **SDK DJI/Insta360**: Requerem app nativa (iOS/Android) - nao funcionam em browser
2. **Lovable AI**: Ja disponivel no projeto, suporta Gemini Vision para analise de imagens
3. **Custos**: Processamento IA tem custo por utilizacao (creditos Lovable)
4. **Testes**: Recomendo testar primeiro com imagens manuais antes de integrar drone

