import { supabase } from '@/integrations/supabase/client';

/**
 * Ponte de upload único: torna um documento carregado na Base de Conhecimento
 * também disponível no IncompatiCheck da mesma obra.
 *
 * Decisão: COPIAR o ficheiro para o bucket `incompaticheck-files` (não referenciar
 * o path da KB). Os buckets são namespaces separados e o IncompatiCheck lê sempre
 * de `incompaticheck-files`; além disso, apagar um projeto do IncompatiCheck remove
 * o ficheiro do storage, pelo que uma referência ao original da KB causaria perda
 * de dados. A RLS de ambos os buckets exige que a 1.ª pasta do path seja o user id.
 *
 * `obraId` é o incompaticheck_obras.id — o mesmo valor que a KB usa em obra_id.
 *
 * Erros são devolvidos por extenso; o chamador decide (e deve) NÃO desfazer o
 * upload da KB por causa de uma falha aqui.
 */
export async function bridgeToIncompaticheck(
  file: File,
  type: string,
  obraId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const path = `${userId}/${obraId}/${Date.now()}_${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from('incompaticheck-files')
    .upload(path, file, { upsert: true });
  if (uploadError) {
    return { ok: false, error: `storage: ${uploadError.message}` };
  }

  const { error: insertError } = await supabase
    .from('incompaticheck_projects')
    .insert({
      user_id: userId,
      obra_id: obraId,
      name: file.name,
      type,
      format: ext,
      file_path: path,
      file_size: file.size,
      from_zip: false,
    });

  if (insertError) {
    // Rollback do storage para não deixar ficheiro órfão no bucket.
    const { error: removeError } = await supabase.storage
      .from('incompaticheck-files')
      .remove([path]);
    if (removeError) {
      console.error('BRIDGE: rollback do storage falhou:', removeError);
    }
    return { ok: false, error: `db: ${insertError.message}` };
  }

  return { ok: true };
}
