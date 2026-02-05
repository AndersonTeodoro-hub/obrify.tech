
# Plano: Redesign Premium dos Componentes UI

## Resumo
Actualizar todos os componentes base do design system (Button, Card, Input, Badge, Table) e os Stat Cards do Dashboard para um visual premium e coeso com a nova paleta slate/accent.

---

## Ficheiros a Modificar

| Ficheiro | Alteracao |
|----------|-----------|
| src/components/ui/button.tsx | Novas variantes premium com gradientes |
| src/components/ui/card.tsx | Rounded-xl, shadow refinado, hover interactivo |
| src/components/ui/input.tsx | Border slate, focus ring primary, rounded-lg |
| src/components/ui/badge.tsx | Variantes de severidade com gradientes |
| src/components/ui/table.tsx | Header uppercase, rows premium, cells refinadas |
| src/pages/app/Dashboard.tsx | Stat Cards redesenhados com estilo premium |

---

## 1. Button (src/components/ui/button.tsx)

### Novas variantes:

```typescript
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary com gradiente e elevacao no hover
        default: "bg-gradient-to-br from-primary-600 to-primary-700 text-white shadow-sm hover:from-primary-500 hover:to-primary-600 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0",
        
        // Destructive com gradiente vermelho
        destructive: "bg-gradient-to-br from-red-600 to-red-700 text-white shadow-sm hover:from-red-500 hover:to-red-600 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0",
        
        // Outline/Secondary com border slate
        outline: "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-foreground",
        
        // Secondary igual ao outline
        secondary: "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-foreground",
        
        // Ghost transparente
        ghost: "bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-foreground",
        
        // Link
        link: "text-primary underline-offset-4 hover:underline",
        
        // Accent (NOVA variante)
        accent: "bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-sm hover:from-accent-400 hover:to-accent-500 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
```

---

## 2. Card (src/components/ui/card.tsx)

### Card base:
```typescript
// rounded-xl (12px), border slate, hover interactivo
const Card = React.forwardRef<...>(({ className, ...props }, ref) => (
  <div 
    ref={ref} 
    className={cn(
      "rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700",
      className
    )} 
    {...props} 
  />
));
```

### CardHeader, CardContent, CardFooter:
- Manter estrutura actual
- Padding consistente

---

## 3. Input (src/components/ui/input.tsx)

### Estilos actualizados:
```typescript
<input
  className={cn(
    "flex h-10 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
    className,
  )}
/>
```

---

## 4. Badge (src/components/ui/badge.tsx)

### Novas variantes de severidade:

```typescript
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground border-slate-200 dark:border-slate-700",
        
        // Variantes de severidade (NOVAS)
        critical: "border-transparent bg-gradient-to-r from-red-600 to-red-700 text-white",
        high: "border-transparent bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900",
        medium: "border-transparent bg-gradient-to-r from-blue-500 to-blue-600 text-white",
        low: "border-transparent bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300",
        
        // Status
        success: "border-transparent bg-gradient-to-r from-green-500 to-green-600 text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);
```

---

## 5. Table (src/components/ui/table.tsx)

### TableHeader:
```typescript
// Header premium: bg cinza, texto uppercase, tracking wider
<thead ref={ref} className={cn("bg-slate-50 dark:bg-slate-800/50 [&_tr]:border-b", className)} {...props} />
```

### TableHead:
```typescript
// Celulas do header: uppercase, tracking, slate-500
<th className={cn(
  "h-12 px-5 text-left align-middle text-xs uppercase tracking-wider font-medium text-slate-500 dark:text-slate-400 [&:has([role=checkbox])]:pr-0",
  className,
)} />
```

### TableRow:
```typescript
// Rows: hover suave, border refinado
<tr className={cn(
  "border-b border-slate-100 dark:border-slate-800 transition-colors data-[state=selected]:bg-muted hover:bg-slate-50 dark:hover:bg-slate-800/50",
  className,
)} />
```

### TableCell:
```typescript
// Cells: padding aumentado
<td className={cn("py-4 px-5 align-middle [&:has([role=checkbox])]:pr-0", className)} />
```

---

## 6. Dashboard Stat Cards (src/pages/app/Dashboard.tsx)

### Redesign dos Stat Cards:

```tsx
const statCards = [
  { 
    title: t('dashboard.totalSites'), 
    value: stats?.sites || 0, 
    icon: HardHat, 
    iconBg: 'bg-primary-100 dark:bg-primary-900/30',
    iconColor: 'text-primary-600 dark:text-primary-400'
  },
  // ... outras cards
];

// Renderizacao:
<Card key={stat.title} className="group">
  <CardContent className="p-6">
    <div className="flex items-start justify-between">
      <div className="space-y-2">
        {/* Label uppercase */}
        <p className="text-xs uppercase tracking-wider font-medium text-slate-500 dark:text-slate-400">
          {stat.title}
        </p>
        {/* Valor grande e elegante */}
        <p className="text-4xl font-light tracking-tight text-foreground">
          {stat.value}
        </p>
      </div>
      {/* Icone com fundo colorido */}
      <div className={cn(
        "w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110",
        stat.iconBg
      )}>
        <stat.icon className={cn("w-6 h-6", stat.iconColor)} />
      </div>
    </div>
  </CardContent>
</Card>
```

### Cores dos icones por card:
- Sites: primary (slate-azulado)
- Capturas: green
- Inspeccoes: accent (cobre)
- NCs: amber/orange

---

## Resultado Visual

```text
+----------------------------------------+
|  BUTTON PRIMARY                        |
|  ┌──────────────────────────────────┐  |
|  │  Gradient slate-600 → 700        │  |
|  │  Hover: elevacao + translate     │  |
|  └──────────────────────────────────┘  |
+----------------------------------------+

+----------------------------------------+
|  CARD PREMIUM                          |
|  ┌──────────────────────────────────┐  |
|  │  Border: slate-200               │  |
|  │  Shadow: sm → md on hover        │  |
|  │  Radius: xl (12px)               │  |
|  └──────────────────────────────────┘  |
+----------------------------------------+

+----------------------------------------+
|  STAT CARD                             |
|  ┌──────────────────────────────────┐  |
|  │  TOTAL OBRAS        [icon]       │  |
|  │  47                              │  |
|  │  (text-4xl font-light)           │  |
|  └──────────────────────────────────┘  |
+----------------------------------------+
```

---

## Paleta de Cores Consistente

| Elemento | Light | Dark |
|----------|-------|------|
| Button Primary | slate-600/700 | slate-500/600 |
| Button Accent | accent-500/600 | accent-400/500 |
| Card Border | slate-200 | slate-800 |
| Card Hover | slate-300 | slate-700 |
| Input Border | slate-200 | slate-700 |
| Input Focus | primary-500 | primary-500 |
| Table Header | slate-50 | slate-800/50 |
| Table Row Hover | slate-50 | slate-800/50 |

---

## Ordem de Implementacao

1. Actualizar Button com novas variantes
2. Actualizar Card com rounded-xl e hover
3. Actualizar Input com border e focus states
4. Actualizar Badge com variantes de severidade
5. Actualizar Table com estilo premium
6. Redesenhar Dashboard Stat Cards
