
# Plano: Redesign Visual Premium do SitePulse

## Resumo
Transformar a interface do SitePulse num visual premium de topo, substituindo a paleta actual (ciano/teal) por uma paleta sofisticada de slate (cinza-azulado) e accent (cobre/bronze). Inclui nova tipografia, sidebar e header redesenhados, e CSS global optimizado.

---

## Ficheiros a Modificar

| Ficheiro | Alteracao |
|----------|-----------|
| index.html | Substituir fonte Inter por Plus Jakarta Sans |
| tailwind.config.ts | Nova paleta de cores primary/accent, nova fontFamily |
| src/index.css | Novas variaveis CSS, transicoes globais, focus states, scrollbar refinada |
| src/components/layout/AppSidebar.tsx | Logo redesenhado, nav items premium, cores slate/accent |
| src/components/layout/AppHeader.tsx | Altura 64px, search bar pill, avatar premium, layout melhorado |
| src/components/layout/AlertBell.tsx | Dot vermelho 8px para indicador |

---

## 1. Fontes (index.html)

Substituir a linha de Google Fonts:

```html
<!-- Remover -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">

<!-- Adicionar -->
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono&display=swap" rel="stylesheet">
```

---

## 2. Tailwind Config (tailwind.config.ts)

### Nova fontFamily:
```typescript
fontFamily: {
  sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'monospace'],
},
```

### Nova paleta de cores:
```typescript
colors: {
  // ... manter as existentes (border, input, etc.)
  
  // Nova paleta primary (slate profissional)
  primary: {
    50: '#f0f4f8',
    100: '#d9e2ec',
    200: '#bcccdc',
    300: '#9fb3c8',
    400: '#829ab1',
    500: '#627d98',
    600: '#486581',
    700: '#334e68',
    800: '#243b53',
    900: '#102a43',
    950: '#0a1929',
    DEFAULT: "hsl(var(--primary))",
    foreground: "hsl(var(--primary-foreground))",
  },
  
  // Nova paleta accent (cobre/bronze)
  accent: {
    50: '#fdf8f3',
    100: '#f9ece0',
    200: '#f3d9c1',
    300: '#e9be96',
    400: '#dd9c66',
    500: '#d4824a',
    600: '#c4683d',
    700: '#a35234',
    DEFAULT: "hsl(var(--accent))",
    foreground: "hsl(var(--accent-foreground))",
  },
  
  // Paleta slate para UI
  slate: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
}
```

---

## 3. CSS Global (src/index.css)

### Novas variaveis de cor:

```css
:root {
  /* Light Mode - Slate + Copper Premium */
  --background: 210 40% 98%;
  --foreground: 215 25% 15%;
  
  --card: 0 0% 100%;
  --card-foreground: 215 25% 15%;
  
  --popover: 0 0% 100%;
  --popover-foreground: 215 25% 15%;
  
  /* Primary: Slate profissional */
  --primary: 210 29% 35%;
  --primary-foreground: 0 0% 100%;
  
  --secondary: 210 40% 96%;
  --secondary-foreground: 215 25% 25%;
  
  --muted: 210 40% 93%;
  --muted-foreground: 215 16% 47%;
  
  /* Accent: Cobre/Bronze */
  --accent: 25 65% 55%;
  --accent-foreground: 0 0% 100%;
  
  --border: 214 32% 91%;
  --input: 214 32% 91%;
  --ring: 25 65% 55%;
  
  /* Sidebar */
  --sidebar-background: 0 0% 100%;
  --sidebar-foreground: 215 25% 25%;
  --sidebar-primary: 210 29% 35%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 25 65% 55%;
  --sidebar-accent-foreground: 0 0% 100%;
  --sidebar-border: 214 32% 91%;
}

.dark {
  /* Dark Mode - Slate escuro + Copper */
  --background: 222 47% 8%;
  --foreground: 210 40% 96%;
  
  --card: 222 47% 11%;
  --card-foreground: 210 40% 96%;
  
  --popover: 222 47% 11%;
  --popover-foreground: 210 40% 96%;
  
  --primary: 210 40% 70%;
  --primary-foreground: 222 47% 8%;
  
  --secondary: 217 33% 17%;
  --secondary-foreground: 210 40% 90%;
  
  --muted: 217 33% 17%;
  --muted-foreground: 215 20% 55%;
  
  --accent: 25 75% 60%;
  --accent-foreground: 222 47% 8%;
  
  --border: 217 33% 17%;
  --input: 217 33% 17%;
  --ring: 25 75% 60%;
  
  /* Sidebar Dark */
  --sidebar-background: 222 47% 8%;
  --sidebar-foreground: 210 40% 85%;
  --sidebar-primary: 210 40% 70%;
  --sidebar-primary-foreground: 222 47% 8%;
  --sidebar-accent: 25 75% 60%;
  --sidebar-accent-foreground: 222 47% 8%;
  --sidebar-border: 217 33% 15%;
}
```

### Novas utilidades globais:

```css
@layer base {
  * {
    @apply border-border transition-colors duration-200;
  }
  
  /* Focus visible premium */
  *:focus-visible {
    @apply outline-none ring-2 ring-accent-500 ring-offset-2 ring-offset-background;
  }
  
  /* Scrollbar mais fina e elegante */
  ::-webkit-scrollbar {
    @apply w-1.5 h-1.5;
  }
  
  ::-webkit-scrollbar-track {
    @apply bg-transparent;
  }
  
  ::-webkit-scrollbar-thumb {
    @apply bg-slate-300 dark:bg-slate-700 rounded-full;
  }
  
  ::-webkit-scrollbar-thumb:hover {
    @apply bg-slate-400 dark:bg-slate-600;
  }
}
```

### Remover efeitos glow (demasiado "cyber"):
- Remover `.glow-primary` e `.glow-accent`
- Remover `.gradient-text` (usar texto solido)
- Manter `.glass` mas simplificar

---

## 4. Sidebar Redesign (AppSidebar.tsx)

### Logo:
```tsx
<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shadow-sm flex-shrink-0">
  <span className="text-white font-bold text-lg">S</span>
</div>
{!isCollapsed && (
  <div className="flex flex-col">
    <span className="font-bold text-foreground">SitePulse</span>
    <span className="text-xs text-muted-foreground">Fiscalizacao Inteligente</span>
  </div>
)}
```

### Nav Items:
```tsx
<NavLink
  to={item.url}
  className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-800"
  activeClassName="bg-gradient-to-r from-primary-50 to-transparent dark:from-slate-800/50 text-accent-600 dark:text-accent-400"
>
  <item.icon className="w-5 h-5 flex-shrink-0" />
  {!isCollapsed && <span className="font-medium">{item.title}</span>}
</NavLink>
```

### Sidebar container:
- Largura colapsada: 72px
- Transicao suave de 300ms
- Remover `glow-primary` do logo
- Cores: Remover gradiente ciano, usar slate/accent

### User Footer:
```tsx
<Avatar className="w-8 h-8">
  <AvatarFallback className="bg-gradient-to-br from-accent-500 to-accent-600 text-white text-sm font-medium">
    {userInitials}
  </AvatarFallback>
</Avatar>
```

---

## 5. Header Redesign (AppHeader.tsx)

### Container:
```tsx
<header className="h-16 border-b border-border/50 bg-background/95 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-10">
```

### Adicionar Search Bar:
```tsx
<div className="flex items-center gap-4 flex-1 max-w-md ml-4">
  <div className="relative w-full">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    <input
      type="text"
      placeholder={t('common.search')}
      className="w-full h-9 pl-10 pr-4 rounded-full bg-slate-100 dark:bg-slate-900 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-500"
    />
  </div>
</div>
```

### Botoes de accao com hover:
```tsx
<Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
```

### User Avatar no Header (opcional):
```tsx
<Avatar className="w-8 h-8 cursor-pointer">
  <AvatarFallback className="bg-gradient-to-br from-accent-500 to-accent-600 text-white text-sm font-medium">
    {userInitials}
  </AvatarFallback>
</Avatar>
```

---

## 6. AlertBell (indicador premium)

Substituir indicador de notificacao:

```tsx
{unreadCount > 0 && (
  <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
)}
```

Mais simples e elegante que o badge numerico.

---

## Paleta Final

```text
+------------------+------------------+
|   LIGHT MODE     |    DARK MODE     |
+------------------+------------------+
| Background       | Background       |
| #fafbfc          | #0d1117          |
+------------------+------------------+
| Cards            | Cards            |
| #ffffff          | #161b22          |
+------------------+------------------+
| Primary (Slate)  | Primary (Slate)  |
| #486581          | #a8c0d8          |
+------------------+------------------+
| Accent (Copper)  | Accent (Copper)  |
| #d4824a          | #e6945c          |
+------------------+------------------+
| Text             | Text             |
| #1e293b          | #e2e8f0          |
+------------------+------------------+
| Muted            | Muted            |
| #64748b          | #64748b          |
+------------------+------------------+
```

---

## Ordem de Implementacao

1. Actualizar index.html com nova fonte
2. Actualizar tailwind.config.ts com paleta e fonts
3. Reescrever variaveis CSS em index.css
4. Redesign do AppSidebar.tsx
5. Redesign do AppHeader.tsx
6. Actualizar AlertBell.tsx
7. Testar visual em light e dark mode

---

## Resultado Esperado

- Visual premium, sofisticado e profissional
- Paleta coerente sem cores vibrantes
- Tipografia moderna (Plus Jakarta Sans)
- Transicoes suaves em toda a interface
- Contraste adequado em ambos os modos
- Zero roxo/violeta, zero ciano vibrante
- Tons de slate para estrutura, cobre para accents
