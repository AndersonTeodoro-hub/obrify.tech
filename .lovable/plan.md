
# Plano: Finalizar Redesign Premium - Animacoes e Polish

## Resumo
Completar o redesign premium aplicando animacoes de entrada, estilos refinados para cards, listas, galerias, empty states e loading states. Adicionar novas animacoes globais ao CSS.

---

## Ficheiros a Modificar

| Ficheiro | Alteracao |
|----------|-----------|
| src/index.css | Animacoes globais (fadeInUp, shimmer), dark mode refinado |
| src/components/ui/skeleton.tsx | Skeleton com efeito shimmer premium |
| src/pages/app/Dashboard.tsx | Animacoes staggered nos stat cards |
| src/pages/app/Sites.tsx | Grid responsivo, cards premium, empty state |
| src/pages/app/NonConformities.tsx | Border-left colorida por severidade |
| src/pages/app/Captures.tsx | Grid 4 colunas, aspect-video, gap-4 |
| src/components/captures/CaptureCard.tsx | Hover scale, overlay gradiente, rounded-xl |

---

## 1. CSS Global - Animacoes (src/index.css)

### Adicionar keyframes e classes:

```css
@layer base {
  /* Animacao fadeInUp */
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  /* Animacao shimmer para skeletons */
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
}

@layer utilities {
  /* Classe de animacao fadeInUp */
  .animate-fade-in-up {
    animation: fadeInUp 0.5s ease-out forwards;
  }
  
  /* Delays para stagger */
  .animation-delay-100 { animation-delay: 100ms; }
  .animation-delay-200 { animation-delay: 200ms; }
  .animation-delay-300 { animation-delay: 300ms; }
  .animation-delay-400 { animation-delay: 400ms; }
  
  /* Shimmer effect */
  .animate-shimmer {
    background: linear-gradient(
      90deg,
      hsl(var(--muted)) 0%,
      hsl(var(--muted)/0.5) 50%,
      hsl(var(--muted)) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }
}
```

### Dark mode review - garantir cores consistentes:
- Backgrounds: bg-slate-950 (base), bg-slate-900 (cards)
- Texto: text-slate-50 (primary), text-slate-400 (secondary)
- Borders: border-slate-800

---

## 2. Skeleton Premium (src/components/ui/skeleton.tsx)

Actualizar com efeito shimmer:

```typescript
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div 
      className={cn(
        "rounded-lg bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 animate-shimmer bg-[length:200%_100%]",
        className
      )} 
      {...props} 
    />
  );
}
```

---

## 3. Dashboard - Animacoes Staggered (src/pages/app/Dashboard.tsx)

### Stats Grid:
- gap-6 (em vez de gap-4)
- Cada card com classe de animacao e delay incremental

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
  {statCards.map((stat, index) => (
    <Card 
      key={stat.title} 
      className={cn(
        "group hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 hover:-translate-y-1 opacity-0 animate-fade-in-up",
        index === 0 && "animation-delay-0",
        index === 1 && "animation-delay-100",
        index === 2 && "animation-delay-200",
        index === 3 && "animation-delay-300"
      )}
    >
      {/* conteudo existente */}
    </Card>
  ))}
</div>
```

---

## 4. Sites - Cards Premium (src/pages/app/Sites.tsx)

### Grid:
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
```

### Site Card redesenhado:

```tsx
<Card
  key={site.id}
  className="group overflow-hidden hover:shadow-lg hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300 cursor-pointer"
  onClick={() => navigate(`/app/sites/${site.id}`)}
>
  {/* Imagem placeholder com gradiente */}
  <div className="h-40 bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
    <HardHat className="w-12 h-12 text-slate-400 dark:text-slate-500" />
  </div>
  
  <CardContent className="p-4">
    <div className="flex items-start justify-between mb-2">
      <h3 className="text-lg font-semibold text-foreground line-clamp-1">{site.name}</h3>
      <DropdownMenu>...</DropdownMenu>
    </div>
    
    {site.address && (
      <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1 mb-3">
        <MapPin className="w-3.5 h-3.5 inline mr-1" />
        {site.address}
      </p>
    )}
    
    <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
      <Badge variant="default">{t('sites.statusActive')}</Badge>
      <span className="text-xs text-slate-400">{site.organizations?.name}</span>
    </div>
  </CardContent>
</Card>
```

### Empty State premium:

```tsx
<Card>
  <CardContent className="flex flex-col items-center justify-center py-16">
    <HardHat className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" />
    <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('sites.noSites')}</h3>
    <p className="text-slate-500 max-w-md mx-auto text-center mt-2">{t('sites.createFirst')}</p>
    {canCreateSite && (
      <Button onClick={() => setIsCreateOpen(true)} className="mt-6" variant="accent">
        <Plus className="w-4 h-4 mr-2" />
        {t('sites.create')}
      </Button>
    )}
  </CardContent>
</Card>
```

---

## 5. NonConformities - Border por Severidade (src/pages/app/NonConformities.tsx)

### Configuracao de cores para border-left:

```typescript
const severityBorderColor = {
  critical: 'border-l-red-500',
  high: 'border-l-amber-500',
  medium: 'border-l-blue-500',
  low: 'border-l-slate-300 dark:border-l-slate-600',
};
```

### TableRow com border-left:

```tsx
<TableRow 
  key={nc.id}
  className={cn(
    "border-l-4",
    severityBorderColor[nc.severity as keyof typeof severityBorderColor] || severityBorderColor.medium
  )}
>
  {/* celulas existentes */}
</TableRow>
```

### Empty State premium:

```tsx
<div className="text-center py-16">
  <AlertTriangle className="w-16 h-16 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
  <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('ncPage.noResults')}</h3>
  <p className="text-slate-500 max-w-md mx-auto mt-2">{t('ncPage.noResultsDesc')}</p>
</div>
```

---

## 6. Captures - Galeria Premium (src/pages/app/Captures.tsx)

### Grid 4 colunas:

```tsx
{/* Loading state com skeletons */}
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
  {[...Array(8)].map((_, i) => (
    <Skeleton key={i} className="aspect-video rounded-xl" />
  ))}
</div>

{/* Content grid */}
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
  {captures.map((capture) => (
    <CaptureCard
      key={capture.id}
      capture={capture}
      onClick={() => handleCaptureClick(capture)}
    />
  ))}
</div>
```

### Empty State:

```tsx
<Card>
  <CardContent className="flex flex-col items-center justify-center py-16">
    <Camera className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" />
    <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('captures.noCaptures')}</h3>
    <p className="text-slate-500 max-w-md mx-auto text-center mt-2">{t('captures.startCapturing')}</p>
    <Button onClick={() => setIsCreateOpen(true)} className="mt-6" variant="accent">
      <Camera className="w-4 h-4 mr-2" />
      {t('captures.new')}
    </Button>
  </CardContent>
</Card>
```

---

## 7. CaptureCard - Visual Premium (src/components/captures/CaptureCard.tsx)

### Card redesenhado:

```tsx
<Card 
  className="overflow-hidden rounded-xl cursor-pointer group"
  onClick={onClick}
>
  <CardContent className="p-0">
    <AspectRatio ratio={16 / 9}>
      <div className="relative w-full h-full bg-slate-100 dark:bg-slate-800">
        <img
          src={/* url */}
          alt={capture.capture_point.code}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        
        {/* Type badge */}
        <div className="absolute top-3 left-3">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium backdrop-blur-sm ${TYPE_COLORS[category]}`}>
            <Icon className="w-3 h-3" />
            {t(`captures.${category}`)}
          </div>
        </div>

        {/* Hover overlay com gradiente */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Info sempre visivel no fundo */}
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-sm font-medium text-white truncate">{capture.capture_point.code}</p>
          <p className="text-xs text-white/70 truncate">
            {capture.capture_point.area.floor.name} • {capture.capture_point.area.name}
          </p>
          <p className="text-[10px] text-white/50 mt-1">
            {format(new Date(captureDate), 'dd/MM/yyyy HH:mm')}
          </p>
        </div>
      </div>
    </AspectRatio>
  </CardContent>
</Card>
```

### Cores de tipo actualizadas (remover roxo):

```typescript
const TYPE_COLORS: Record<CaptureCategory, string> = {
  photo: 'bg-green-500/20 text-green-400 border-green-500/30',
  video: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  panorama: 'bg-accent-500/20 text-accent-400 border-accent-500/30',
};
```

---

## Resumo de Alteracoes Visuais

```text
+----------------------------------------------+
|  DASHBOARD                                   |
|  ┌────┐ ┌────┐ ┌────┐ ┌────┐                |
|  │ 47 │ │ 12 │ │ 89 │ │  5 │  <- stagger    |
|  └────┘ └────┘ └────┘ └────┘     animation  |
|    0ms   100ms  200ms  300ms                 |
+----------------------------------------------+

+----------------------------------------------+
|  SITES GRID (3 colunas)                      |
|  ┌──────────┐ ┌──────────┐ ┌──────────┐     |
|  │  [img]   │ │  [img]   │ │  [img]   │     |
|  │ Site A   │ │ Site B   │ │ Site C   │     |
|  │ Rua...   │ │ Av...    │ │ Trav...  │     |
|  └──────────┘ └──────────┘ └──────────┘     |
|  hover: scale(1.02) + shadow-lg             |
+----------------------------------------------+

+----------------------------------------------+
|  NC TABLE (border-left por severidade)       |
|  ┃ #001 │ Obra X │ Desc... │ CRITICAL       |
|  ┃ #002 │ Obra Y │ Desc... │ HIGH           |
|  ┃ #003 │ Obra Z │ Desc... │ MEDIUM         |
|  red    amber    blue                        |
+----------------------------------------------+

+----------------------------------------------+
|  CAPTURES GALLERY (4 colunas)                |
|  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐            |
|  │16:9 │ │16:9 │ │16:9 │ │16:9 │            |
|  └─────┘ └─────┘ └─────┘ └─────┘            |
|  hover: scale(1.05) + overlay gradient      |
+----------------------------------------------+
```

---

## Ordem de Implementacao

1. Actualizar CSS global com animacoes
2. Actualizar Skeleton com shimmer
3. Adicionar animacoes staggered ao Dashboard
4. Redesenhar cards na pagina Sites
5. Adicionar border-left nas NCs
6. Actualizar grid de Captures para 4 colunas
7. Redesenhar CaptureCard com aspect-video e hover

