
# Plano: Adicionar LanguageSwitcher à Página de Autenticação

## Problema
O botão de troca de idiomas está em falta na página de autenticação (`/auth`). Actualmente só aparece o `ThemeToggle`.

## Solução
Adicionar o componente `LanguageSwitcher` ao lado do `ThemeToggle` na página de autenticação.

---

## Ficheiro a Modificar

| Ficheiro | Alteração |
|----------|-----------|
| src/pages/Auth.tsx | Importar e adicionar LanguageSwitcher junto ao ThemeToggle |

---

## Alterações Detalhadas

### 1. Adicionar import (linha 12):
```typescript
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
```

### 2. Actualizar a área dos botões (linhas 167-169):

De:
```tsx
<div className="flex justify-end mb-6">
  <ThemeToggle />
</div>
```

Para:
```tsx
<div className="flex justify-end gap-1 mb-6">
  <LanguageSwitcher />
  <ThemeToggle />
</div>
```

---

## Resultado
O seletor de idiomas aparecerá no canto superior direito da página de login, ao lado do botão de tema, permitindo aos utilizadores escolher o idioma antes mesmo de fazer login.
