

# Corrigir Preview de Partilha + Botao de Compartilhamento

## Problema 1: Logo nao aparece na preview de partilha

A imagem do logo esta acessivel no storage, mas ha dois problemas:

1. **Falta a meta tag `og:url`** - Sem esta tag, plataformas como WhatsApp podem nao carregar a preview correctamente
2. **A imagem e quadrada e pequena** - O formato ideal para OG e 1200x630px. Uma imagem quadrada pode ser ignorada por algumas plataformas
3. **Falta `og:site_name`** - Ajuda plataformas a identificar a marca

**Solucao**: Adicionar as meta tags em falta (`og:url`, `og:site_name`) e manter o logo actual mas garantir que todas as tags estao correctas. Tambem adicionar um fallback com `og:image:type`.

## Problema 2: Botao de Compartilhamento

Criar um botao de partilha na pagina de autenticacao (Auth) que permite ao utilizador partilhar o link da plataforma com outros.

**Funcionalidades do botao:**
- Usa a Web Share API nativa (`navigator.share`) em dispositivos que a suportam (mobile)
- Em desktop (onde a Web Share API pode nao estar disponivel), faz fallback para copiar o link para a area de transferencia
- Texto pre-definido: "Conhece o Obrify - Plataforma de Fiscalizacao de Obras Inteligente"
- Posicionado no canto superior da pagina de autenticacao, junto aos botoes de idioma e tema

---

## Detalhes Tecnicos

### Alteracoes em `index.html`
- Adicionar `<meta property="og:url" content="https://obrify.tech" />`
- Adicionar `<meta property="og:site_name" content="Obrify" />`
- Adicionar `<meta property="og:image:type" content="image/jpeg" />`

### Novo componente `src/components/ShareButton.tsx`
- Componente reutilizavel com icone de partilha (lucide `Share2`)
- Usa `navigator.share()` quando disponivel
- Fallback: copia URL para clipboard com toast de confirmacao
- Partilha com titulo, descricao e URL da plataforma

### Alteracoes em `src/pages/Auth.tsx`
- Importar e adicionar o `ShareButton` na barra superior (junto ao LanguageSwitcher e ThemeToggle)

### Traducoes (4 ficheiros de locale)
- Adicionar chaves: `share.title`, `share.text`, `share.copied`, `share.button`

