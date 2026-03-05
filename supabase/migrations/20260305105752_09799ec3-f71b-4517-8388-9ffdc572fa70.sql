ALTER TABLE incompaticheck_projects DROP CONSTRAINT IF EXISTS incompaticheck_projects_type_check;

ALTER TABLE incompaticheck_projects ADD CONSTRAINT incompaticheck_projects_type_check 
  CHECK (type IN ('fundacoes', 'estrutural', 'rede_enterrada', 'terraplanagem', 'arquitectura', 'avac', 'aguas_esgotos', 'electricidade'));