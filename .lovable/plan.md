

# Plano: Redesenhar Pagina de Auth como Landing Page Premium Split-Screen

## Resumo
Reescrever completamente `src/pages/Auth.tsx` com layout split-screen premium: formulario a esquerda (40%) e hero com imagem do drone a direita (60%). Copiar a imagem enviada para `public/images/hero-drone.jpeg`. Renomear branding de "SitePulse" para "Obrify".

---

## Ficheiros a Criar/Copiar

| Ficheiro | Descricao |
|----------|-----------|
| public/images/hero-drone.jpeg | Copiar imagem enviada pelo utilizador |

## Ficheiros a Modificar

| Ficheiro | Alteracao |
|----------|-----------|
| src/pages/Auth.tsx | Reescrita completa com novo layout split-screen |

---

## Detalhes Tecnicos

### 1. Copiar Imagem

Copiar `user-uploads://hero-drone-obrify.jpeg` para `public/images/hero-drone.jpeg`.

### 2. Novo Layout de Auth.tsx

A pagina sera completamente reescrita mantendo a logica de autenticacao existente (handleLogin, handleSignup, useAuth, useToast, navigate).

#### Estrutura Desktop (lg+):

```text
+------------------+----------------------------+
|                  |                            |
|  FORMULARIO      |   HERO COM IMAGEM          |
|  (lg:w-[40%])    |   (lg:w-[60%])             |
|                  |                            |
|  - Logo Obrify   |   bg: hero-drone.jpeg      |
|  - "Bem-vindo"   |   overlay: gradient escuro |
|  - Email input   |                            |
|  - Password      |   Badge: Plataforma        |
|  - Lembrar-me    |     Operacional            |
|  - Esqueceu pwd  |                            |
|  - Btn Entrar    |   Titulo: Fiscalizacao     |
|  - "ou"          |     com IA (gradient)      |
|  - Criar conta   |                            |
|  - Footer 2026   |   4 Pills                  |
|                  |                            |
|                  |   3 Stats no fundo         |
|                  |                            |
+------------------+----------------------------+
```

#### Estrutura Mobile:

```text
+----------------------------+
|   HERO COMPACTO (45vh)     |
|   - Imagem + overlay       |
|   - Badge pequeno          |
|   - Titulo curto           |
|   - Subtitulo curto        |
+----------------------------+
|   FORMULARIO               |
|   - Logo + nome            |
|   - Form completo          |
|   - Footer                 |
+----------------------------+
```

### 3. Lado Esquerdo - Formulario

Estado por defeito: Login. Link para alternar para Signup (sem tabs, design mais limpo).

Elementos:
- Logo Obrify (icone gradiente slate + nome "Obrify")
- Titulo "Bem-vindo" / Subtitulo "Entre na sua conta para continuar"
- Input Email (rounded-xl, padding generoso)
- Input Password (rounded-xl)
- Linha com checkbox "Lembrar-me" + link "Esqueceu password?"
- Botao "Entrar" (gradient primary-600 to primary-700, shadow-lg, hover:-translate-y-0.5)
- Divisor "ou" com linhas
- Link "Ainda nao tem conta? Criar conta gratuita"
- Quando em modo signup: Nome, Email, Password, Confirmar Password
- Footer: (c) 2026 Obrify
- Botoes ThemeToggle e LanguageSwitcher no topo direito

### 4. Lado Direito - Hero com Imagem

Camadas:
1. `<img>` ou `background-image` com `hero-drone.jpeg` (object-cover)
2. Overlay: `bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-900/80`
3. Grid pattern opcional (SVG base64 com linhas brancas 5% opacidade)

Conteudo (sempre texto claro):

**Topo:**
- Badge: indicador verde pulsante + "Plataforma Operacional" (bg-white/10, backdrop-blur, border white/10)

**Centro:**
- Titulo: "Fiscalizacao de obras com" + nova linha "Inteligencia Artificial" (gradient amber-400 to orange-500)
- Subtitulo: "Detecte defeitos automaticamente, digitalize inspeccoes e gere relatorios profissionais."
- 4 Pills em flex-wrap:
  - "Visao por IA"
  - "Checklists Digitais"
  - "Relatorios PDF"
  - "Captura por Drone"
  (cada com bg-white/10, backdrop-blur-sm, texto branco)

**Bottom:**
- 3 Stats com separadores verticais (border-l white/20):
  - "3x" + "Mais produtividade"
  - "94%" + "Menos papel"
  - "IA" + "Deteccao automatica"

### 5. Animacoes

- Elementos do hero com classes `animate-fade-in` e delays staggered (delay-100, delay-200, etc.)
- Badge com indicador verde pulsante (`animate-pulse`)
- Botao Entrar com `hover:-translate-y-0.5 hover:shadow-xl transition-all duration-200`

### 6. Dark/Light Mode

- Formulario: `bg-white dark:bg-slate-950`
- Hero: sempre escuro (overlay sobre imagem)
- Inputs: `bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800`

---

## Logica Mantida

Toda a logica de autenticacao existente e mantida:
- `handleLogin` e `handleSignup` sem alteracoes
- `useAuth`, `signIn`, `signUp`
- Validacoes de password
- Toasts de erro/sucesso
- Navegacao para `/app` apos sucesso
- Estado `isLoading`
- `useState` para toggle entre login e signup (em vez de Tabs)

---

## Ordem de Implementacao

1. Copiar imagem para `public/images/hero-drone.jpeg`
2. Reescrever `src/pages/Auth.tsx` com novo layout completo

