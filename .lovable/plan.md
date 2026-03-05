

# Plan: Update incompaticheck_projects type constraint

Run a single SQL migration to drop the old `incompaticheck_projects_type_check` constraint and recreate it with all 8 project types.

## Migration SQL

```sql
ALTER TABLE incompaticheck_projects DROP CONSTRAINT IF EXISTS incompaticheck_projects_type_check;

ALTER TABLE incompaticheck_projects ADD CONSTRAINT incompaticheck_projects_type_check 
  CHECK (type IN ('fundacoes', 'estrutural', 'rede_enterrada', 'terraplanagem', 'arquitectura', 'avac', 'aguas_esgotos', 'electricidade'));
```

No code changes required.

