
# Correcao UX + Responsividade do IncompatiCheck

## Resumo

Remover o ecra bloqueante `ObraSetupScreen`, substituindo-o por um modal (`ObraRegistModal`) acessivel via botao no header. Adicionar responsividade ao layout para ecras menores.

## Alteracoes no ficheiro `src/pages/app/IncompatiCheck.tsx`

### 1. Remover ObraSetupScreen

Apagar o componente `ObraSetupScreen` (linhas 424-476) e o bloco condicional `if (showObraSetup)` (linhas 514-516), e o state `showObraSetup` (linha 480).

### 2. Adicionar ObraRegistModal

Novo componente antes do `export default`, no mesmo local onde estava o `ObraSetupScreen`. Modal overlay com 3 campos (Nome da Obra obrigatorio, Cidade, Fiscal), botoes Cancelar e "Registar e Iniciar".

### 3. Adicionar state `showObraModal`

Junto ao state `obraInfo` existente (linha 479), adicionar:
- `const [showObraModal, setShowObraModal] = useState(false);`

### 4. Alterar Header

Na zona dos botoes a direita (linha 536-539):
- Adicionar botoes mobile (📁 e 🏗️) visiveis apenas em `lg:hidden`
- Adicionar botao "Registar Analise" (gradiente laranja) ou info da obra com botao de edicao, antes dos botoes Upload e Partilhar

### 5. Adicionar modal no return

Junto aos outros modais (linha 648-649), adicionar `ObraRegistModal`.

### 6. Responsividade

- **Stats grid** (linha 585): `repeat(4, 1fr)` para mobile usa classes Tailwind `grid-cols-2 sm:grid-cols-4` em vez de inline style
- **Sidebar** (linha 544): esconder em `max-lg:hidden`
- **Agent Panel**: esconder em `max-lg:hidden`
- **Header**: ajustar padding e gap para mobile

### 7. Exportar ObraRegistModal

Adicionar ao export na linha 660.

## Ficheiros modificados

| Ficheiro | Alteracao |
|---|---|
| `src/pages/app/IncompatiCheck.tsx` | Remover ObraSetupScreen, adicionar ObraRegistModal, responsividade, botao header |
