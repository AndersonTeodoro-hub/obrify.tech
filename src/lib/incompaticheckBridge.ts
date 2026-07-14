import { supabase } from '@/integrations/supabase/client';

// Rótulos da KB (PROJECT_SPECIALTIES) → slugs aceites pela CHECK constraint
// incompaticheck_projects_type_check. Especialidades sem entrada NÃO existem no
// IncompatiCheck (Topografia, Telecomunicações, Gás, Segurança Contra Incêndios,
// Acústica, Térmica) e não devem ser bridgeadas.
export const SPECIALTY_TO_IC_TYPE: Record<string, string> = {
  'Estrutural': 'estrutural',
  'Fundações': 'fundacoes',
  'Rede Enterrada': 'rede_enterrada',
  'Arquitectura': 'arquitectura',
  'AVAC': 'avac',
  'Águas e Esgotos': 'aguas_esgotos',
  'Electricidade': 'electricidade',
};

export function specialtyToIcType(specialty: string): string | null {
  return SPECIALTY_TO_IC_TYPE[specialty] ?? null;
}

/**
 * Ponte de upload único: torna um documento da Base de Conhecimento também
 * disponível no IncompatiCheck da mesma obra. COPIA o ficheiro para o bucket
 * `incompaticheck-files` e insere em `incompaticheck_projects`.
 * NOTA: `type` é já o SLUG do IncompatiCheck (ver SPECIALTY_TO_IC_TYPE), não o
 * rótulo da KB. `obraId` é o incompaticheck_obras.id (== obra_id da KB).
 * Erros por extenso; o chamador NÃO deve desfazer o upload da KB por falha aqui.
 */
export async function bridgeToIncompaticheck(
  file: File,
  type: string,
  obraId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  // Defesa dupla: `type` tem de ser um slug válido da CHECK constraint.
  const allowed = Object.values(SPECIALTY_TO_IC_TYPE);
  if (!allowed.includes(type)) {
    const msg = `tipo inválido para IncompatiCheck: "${type}" (esperado um de: ${allowed.join(', ')})`;
    console.error('BRIDGE:', msg);
    return { ok: false, error: msg };
  }

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const path = `${userId}/${obraId}/${Date.now()}_${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from('incompaticheck-files')
    .upload(path, file, { upsert: true });
  if (uploadError) {
    console.error('BRIDGE: upload storage falhou (incompaticheck-files):', uploadError);
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
    console.error('BRIDGE: insert incompaticheck_projects falhou:', insertError);
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

/**
 * Re-bridge de um documento JÁ existente na KB: descarrega o original do bucket
 * `project-knowledge`, converte em File e reutiliza a ponte. Idempotente — não
 * duplica se já existir um projeto com o mesmo nome nesta obra. Não lança:
 * devolve um status por documento para o chamador reportar por extenso.
 */
export async function rebridgeKnowledgeDoc(
  doc: { document_name: string; specialty: string; file_path: string | null },
  obraId: string,
  userId: string,
): Promise<{ status: 'ok' | 'skipped-exists' | 'skipped-no-type' | 'error'; error?: string }> {
  const icType = specialtyToIcType(doc.specialty);
  if (!icType) return { status: 'skipped-no-type' };
  if (!doc.file_path) return { status: 'error', error: 'documento sem file_path na KB' };

  // Idempotência: já existe no IncompatiCheck? (mesma obra + mesmo nome)
  const { data: existing, error: existErr } = await supabase
    .from('incompaticheck_projects')
    .select('id')
    .eq('obra_id', obraId)
    .eq('name', doc.document_name)
    .limit(1);
  if (existErr) {
    console.error('BRIDGE-REBRIDGE: verificação de duplicado falhou:', existErr);
    return { status: 'error', error: `db (verificação): ${existErr.message}` };
  }
  if (existing && existing.length > 0) return { status: 'skipped-exists' };

  // Descarregar o original do bucket da KB (RLS: dono lê a sua própria pasta).
  const { data: blob, error: dlErr } = await supabase.storage
    .from('project-knowledge')
    .download(doc.file_path);
  if (dlErr || !blob) {
    console.error('BRIDGE-REBRIDGE: download da KB falhou:', dlErr);
    return { status: 'error', error: `storage (download KB): ${dlErr?.message || 'sem dados'}` };
  }

  const file = new File([blob], doc.document_name, { type: blob.type || 'application/pdf' });
  const bridged = await bridgeToIncompaticheck(file, icType, obraId, userId);
  if (!bridged.ok) return { status: 'error', error: bridged.error };
  return { status: 'ok' };
}
