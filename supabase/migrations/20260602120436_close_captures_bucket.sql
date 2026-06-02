-- Fecha o bucket captures (publico -> privado). Contem fotografias
-- operacionais de obra (defeitos, NCs, evidencias). A Fase 1 ja migrou
-- os 2 call sites de getPublicUrl para createSignedUrl, portanto fechar
-- o bucket nao parte nada -- signed URLs funcionam em bucket privado.
-- Reversivel: UPDATE storage.buckets SET public = true WHERE id = 'captures';

UPDATE storage.buckets SET public = false WHERE id = 'captures';
