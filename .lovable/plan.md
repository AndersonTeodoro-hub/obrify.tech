
# Gestao de Projetos na Sidebar do IncompatiCheck

## Resumo

Adicionar interactividade aos cards de projetos na sidebar: botoes de accao ao hover (ver detalhes e remover), modal de preview com informacao completa, e confirmacao de remocao com feedback no chat do agente.

## Alteracoes no ficheiro `src/pages/app/IncompatiCheck.tsx`

### 1. Novo state `previewProject`

Na linha 475, junto aos outros estados, adicionar:
- `const [previewProject, setPreviewProject] = useState<Project | null>(null);`

### 2. Substituir cards de projetos na sidebar (linhas 555-564)

Substituir o bloco `.map` actual por cards com `group` class e botoes de accao ao hover:
- Botao 👁 (ver detalhes) -- abre `ProjectPreviewModal`
- Botao 🗑 (remover) -- pede confirmacao via `window.confirm`, remove do estado, envia mensagem ao agente
- Barra lateral colorida por tipo de projecto
- Layout com truncate no nome e badges de formato/tamanho

### 3. Novo componente `ProjectPreviewModal` (antes do export default, linha 472)

Modal overlay com:
- Icone e label do tipo de projecto
- Detalhes: formato, tamanho, data de carregamento, ID
- Botoes: Fechar e Remover (com confirmacao)

### 4. Adicionar modal no return (linha 660)

Junto aos outros modais, renderizar `ProjectPreviewModal` com props `project`, `onClose` e `onDelete`.

### 5. Actualizar contador na sidebar (linha 553)

Ja esta correcto: `Projetos ({projects.length})` -- manter.

### 6. Actualizar exports (linha 671)

Adicionar `ProjectPreviewModal` ao export.

## Ficheiros modificados

| Ficheiro | Alteracao |
|---|---|
| `src/pages/app/IncompatiCheck.tsx` | Novo state, cards interactivos, ProjectPreviewModal, export |
