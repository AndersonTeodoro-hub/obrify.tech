

# Plano: Auto-admin para email especifico + campo PIN nos perfis

## Resumo

Quando o email `cris7981x@gmail.com` criar conta, o sistema automaticamente:
1. Cria uma organizacao padrao (se nao existir)
2. Cria um membership com role `admin` nessa organizacao
3. Adiciona um campo `pin` a tabela `profiles`

Tudo isto sera feito atraves de uma migracao SQL que modifica a funcao `handle_new_user()`.

---

## Alteracoes

### 1. Migracao SQL

Uma unica migracao que:

**a) Adiciona coluna `pin` a tabela profiles:**
```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin TEXT;
```

**b) Modifica a funcao `handle_new_user()` para:**
- Criar o perfil (como ja faz)
- Se o email for `cris7981x@gmail.com`:
  - Criar uma organizacao "Obrify" (ou usar existente)
  - Inserir um membership com role `admin`

Logica da funcao atualizada:
```text
1. INSERT INTO profiles (user_id, email, full_name)
2. IF email = 'cris7981x@gmail.com' THEN
   a. Criar org "Obrify" se nao existir
   b. INSERT INTO memberships (user_id, org_id, role = 'admin')
3. RETURN NEW
```

### 2. Nenhuma alteracao de codigo frontend

A logica e toda no backend (trigger SQL). O frontend ja usa `usePermissions()` que le a tabela `memberships` -- portanto o utilizador tera automaticamente todas as permissoes de admin apos login.

---

## Detalhes Tecnicos

A funcao `handle_new_user()` sera substituida por:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _org_id UUID;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');

  -- Auto-admin for specific email
  IF NEW.email = 'cris7981x@gmail.com' THEN
    -- Get or create default org
    SELECT id INTO _org_id FROM public.organizations
    WHERE name = 'Obrify' LIMIT 1;

    IF _org_id IS NULL THEN
      INSERT INTO public.organizations (name)
      VALUES ('Obrify')
      RETURNING id INTO _org_id;
    END IF;

    -- Create admin membership
    INSERT INTO public.memberships (user_id, org_id, role)
    VALUES (NEW.id, _org_id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

---

## Notas de Seguranca

- A funcao usa `SECURITY DEFINER` para poder inserir em tabelas protegidas por RLS
- O email esta hardcoded na funcao do lado do servidor (nao no cliente), o que e seguro
- O campo `pin` e adicionado como `TEXT` nullable para flexibilidade futura

