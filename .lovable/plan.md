

# Corrigir Login Google no Dominio Personalizado (obrify.tech)

## Problema

Quando alguem recebe o link do Obrify (obrify.tech), abre no telemovel e tenta fazer login com Google pela primeira vez, recebe erro 404. Isto acontece porque o fluxo OAuth usa um "auth-bridge" que so funciona em dominios `.lovable.app` - no dominio personalizado obrify.tech, o callback do Google nao sabe para onde voltar.

## Solucao

Detectar se a aplicacao esta a correr num dominio personalizado (obrify.tech) e, nesse caso, usar o fluxo OAuth directo do Supabase (bypassing o auth-bridge). Em dominios Lovable, manter o fluxo actual.

Tambem adicionar um redirect automatico para utilizadores que ja estejam autenticados na pagina de Auth.

## Alteracoes

### `src/pages/Auth.tsx`

1. **Detectar dominio personalizado** - Verificar se `window.location.hostname` NAO e `lovable.app` nem `lovableproject.com`

2. **Fluxo alternativo para dominio personalizado** - Usar `supabase.auth.signInWithOAuth` directamente com `skipBrowserRedirect: true`, validar o URL do Google, e redirecionar manualmente

3. **Redirect automatico** - Adicionar `useEffect` que redireciona para `/app` quando o utilizador ja esta autenticado (resolve tambem o problema do callback voltar para `/auth`)

---

## Detalhes Tecnicos

### Nova funcao `handleGoogleSignIn` em `Auth.tsx`

Substituir os dois blocos inline de `onClick` do Google por uma funcao partilhada:

```typescript
const isCustomDomain = !window.location.hostname.includes("lovable.app") 
  && !window.location.hostname.includes("lovableproject.com");

const handleGoogleSignIn = async () => {
  try {
    if (isCustomDomain) {
      // Bypass auth-bridge: usar Supabase directamente
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/app`,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (data?.url) {
        // Validar URL antes de redirecionar (seguranca)
        const oauthUrl = new URL(data.url);
        const allowedHosts = ["accounts.google.com"];
        if (!allowedHosts.some(h => oauthUrl.hostname === h)) {
          throw new Error("Invalid OAuth redirect URL");
        }
        window.location.href = data.url;
      }
    } else {
      // Dominios Lovable: usar auth-bridge normal
      const { error } = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (error) throw error;
    }
  } catch (error: any) {
    toast({ title: t("auth.socialLoginError"), description: error.message, variant: "destructive" });
  }
};
```

### Redirect automatico para utilizadores autenticados

```typescript
const { user, loading, signIn, signUp } = useAuth();

useEffect(() => {
  if (!loading && user) {
    navigate("/app");
  }
}, [user, loading, navigate]);
```

### Ambos os botoes Google (login e signup, linhas 219-238 e 281-300)

Substituir o `onClick` inline por `onClick={handleGoogleSignIn}`.

### Resumo das alteracoes
- **1 ficheiro modificado**: `src/pages/Auth.tsx`
- **Logica**: Deteccao de dominio + fluxo OAuth alternativo + redirect automatico
- **Seguranca**: Validacao do URL de redirect contra hosts permitidos
