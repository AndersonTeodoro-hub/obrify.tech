

# Plano: Logo Obrify + Meta Tags OG + Fix da rota

## Problema Actual

1. **Meta tags OG** apontam para a imagem do Lovable (`lovable.dev/opengraph-image-p98pqg.png`) - quando partilhas o link aparece o logo do Lovable
2. **Titulo e descricao** ainda dizem "SitePulse" em vez de "Obrify"
3. **Favicon** e o default do Lovable
4. **Logo na sidebar** e uma letra "S" num quadrado, nao o logo real
5. **Logo na pagina de login** usa o icone `Activity` em vez do logo real
6. **Rota `/`** redireciona para `/auth` mas pode haver problema de carregamento

## O Que Vai Ser Feito

### 1. Copiar a imagem do logo para o projecto
- Copiar `user-uploads://Logo_oficial_obrify.jpeg` para `public/images/obrify-logo.jpeg`
- Usar como favicon, OG image, e logo na plataforma

### 2. Actualizar `index.html` - Meta Tags e Favicon
- **Titulo**: "Obrify - Fiscalizacao de Obras Inteligente"
- **og:title**: "Obrify - Fiscalizacao de Obras Inteligente"
- **og:description**: actualizar com texto Obrify
- **og:image**: apontar para a URL publica da imagem do logo (URL absoluta do dominio publicado)
- **twitter:image**: idem
- **favicon**: apontar para `/images/obrify-logo.jpeg`
- **author**: "Obrify"
- **twitter:site**: "@Obrify"

### 3. Actualizar logo na Sidebar (`AppSidebar.tsx`)
- Substituir o quadrado com letra "S" por uma tag `<img>` com `/images/obrify-logo.jpeg`
- Manter o `rounded-xl` e tamanho `w-10 h-10`

### 4. Actualizar logo na pagina de Login (`Auth.tsx`)
- Substituir o icone `Activity` por `<img src="/images/obrify-logo.jpeg">`
- Manter o estilo do container

### 5. Verificar a rota `/`
- A rota actual faz `Navigate to="/auth"` - verificar se esta correcta
- Adicionar `og:url` meta tag

## Ficheiros a Modificar

| Ficheiro | Alteracao |
|----------|-----------|
| `public/images/obrify-logo.jpeg` | Copiar logo do upload |
| `index.html` | Meta tags OG, titulo, favicon |
| `src/components/layout/AppSidebar.tsx` | Logo real no header |
| `src/pages/Auth.tsx` | Logo real no login |

