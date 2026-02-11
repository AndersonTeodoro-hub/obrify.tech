
# Adicionar Ecra de Identificacao da Obra ao IncompatiCheck

## Resumo

Adicionar um ecra inicial de setup ("Identificacao do Pedido de Analise") que recolhe nome da obra, cidade e fiscal antes de mostrar o modulo principal. Os dados ficam visiveis no header e sao incluidos nas mensagens de partilha.

## Alteracoes

### 1. Base de dados -- 3 novas colunas

Adicionar via migracao SQL a `incompaticheck_analyses`:
- `obra_nome TEXT`
- `obra_cidade TEXT`  
- `obra_fiscal TEXT`

### 2. Ficheiro `src/pages/app/IncompatiCheck.tsx`

**Novos estados** (linhas 423-430): adicionar `obraInfo` e `showObraSetup`.

**Novo componente** `ObraSetupScreen` antes do `export default function IncompatiCheck()` (antes da linha 422):
- Ecra fullscreen com fundo escuro e grid decorativo
- 3 campos: Nome da Obra (obrigatorio), Cidade, Fiscal
- Botao "Iniciar Analise de Incompatibilidades" (desactivado sem nome)
- Nota informativa sobre uso dos dados nos relatorios

**Condicao no return** do `IncompatiCheck`: se `showObraSetup` e true, renderiza `ObraSetupScreen` em vez do layout principal.

**Header**: depois do badge "Modulo v2.4", mostrar `obraInfo` (nome, cidade, fiscal) separado por borda vertical.

**ShareModal**: receber `obraInfo` como prop e incluir os dados nos textos de email e WhatsApp:
- Subject email: `Relatorio de Incompatibilidades -- {nome da obra}`
- Body WhatsApp: inclui obra, cidade e fiscal

### Ficheiros modificados

| Ficheiro | Alteracao |
|---|---|
| `src/pages/app/IncompatiCheck.tsx` | Adicionar ObraSetupScreen, estados, header info, ShareModal com obraInfo |
| Migracao SQL | 3 colunas em incompaticheck_analyses |
