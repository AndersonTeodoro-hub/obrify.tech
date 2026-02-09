

# Fix: Rotas directas dao 404 no obrify.tech

## Problema

O dominio `obrify.tech` abre na raiz (`/`) porque o servidor encontra o `index.html`, mas qualquer rota directa como `/auth` da 404 porque o servidor procura um ficheiro fisico que nao existe. Isto e um problema classico de SPA (Single Page Application) - o React Router so funciona depois do `index.html` carregar.

## Solucao

Criar um ficheiro `vercel.json` na raiz do projecto com uma regra que redireciona todas as rotas para o `index.html`.

## Ficheiro a Criar

| Ficheiro | Descricao |
|----------|-----------|
| `vercel.json` | Regra de rewrite para SPA routing |

## Conteudo

O ficheiro tera uma unica regra de rewrite:
- Qualquer rota (`/auth`, `/app/sites`, `/reset-password`, etc.) serve o `index.html`
- O React Router no browser resolve a rota correcta

## Alternativa

Se preferires simplificar, podes conectar o dominio `obrify.tech` directamente pelo Lovable (Settings > Domains) em vez de usar o Vercel. O Lovable trata do SPA routing automaticamente.

