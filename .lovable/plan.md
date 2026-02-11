

# Gestao de Obras + Suporte ZIP no IncompatiCheck

## Resumo

Substituir o state simples `obraInfo` por um sistema multi-obra com lista, seleccao e gestao. Adicionar suporte a ficheiros ZIP/RAR/7Z no upload com simulacao de extraccao. Criar modal de gestao de obras e indicador de progresso.

## Alteracoes no ficheiro `src/pages/app/IncompatiCheck.tsx`

### 1. Novo interface `Obra` (linha 28, apos `Project`)

Adicionar interface com campos: id, nome, cidade, fiscal, created_at, project_count.

### 2. Substituir states (linhas 527-528)

Remover `obraInfo` e `showObraModal`. Adicionar:
- `obras: Obra[]` (lista de obras)
- `obraAtiva: Obra | null` (obra seleccionada)
- `showObraModal: boolean`
- `showObraList: boolean`
- `uploadProgress: string | null`

### 3. Actualizar UploadModal (linhas 217-297)

- Extensoes aceites: adicionar `.zip,.rar,.7z` ao input file accept (linha 265)
- Validacao de extensao (linha 227): adicionar `"zip", "rar", "7z"` ao array
- Texto de formatos (linhas 248, 264): mudar para `PDF . DWG . DWF . IFC . ZIP`
- Alerta de tamanho (linha 225): mensagem actualizada para ZIPs
- Adicionar bloco informativo sobre ZIPs apos a zona de drag/drop (antes linha 268)

### 4. Substituir handleUpload (linhas 549-553)

Nova logica com deteccao de ZIP:
- Se ZIP: mostra progresso, simula extraccao com setTimeout (2.5s), cria 5 projectos extraidos, actualiza obra activa
- Se ficheiro normal: comportamento actual mantido, actualiza obra activa

### 5. Novo componente ObraListModal (antes do export, linha 524)

Modal overlay com:
- Header com titulo, contagem e botao "+ Nova Obra"
- Lista de obras com destaque na activa (badge "Ativa")
- Info: nome, cidade, fiscal, n.o projectos, data
- Botao remover ao hover com confirmacao
- Estado vazio com emoji e instrucoes
- Clicar numa obra selecciona-a e fecha o modal

### 6. Actualizar header (linhas 587-599)

Substituir bloco `obraInfo`/botao por:
- Se `obraAtiva`: botao dropdown com nome + cidade + seta, abre `ObraListModal`
- Se null: botao "Registar Obra" com gradiente laranja, abre `ObraRegistModal`

### 7. Actualizar referencia `obraInfo` no header decorativo (linhas 574-580)

Substituir `obraInfo` por `obraAtiva` no bloco de info junto ao titulo.

### 8. Actualizar ObraRegistModal onConfirm (linha 742)

Em vez de `setObraInfo`, criar objecto `Obra`, adicionar a `obras`, definir como `obraAtiva`, e enviar mensagem ao agente.

### 9. Actualizar ShareModal prop (linha 741)

Substituir `obraInfo={obraInfo}` por `obraInfo={obraAtiva}`.

### 10. Indicador de progresso ZIP na sidebar (antes linha 648)

Bloco condicional com spinner e texto de `uploadProgress`.

### 11. Actualizar texto do botao upload na sidebar (linha 651)

Mudar de `PDF . DWG . DWF . IFC` para `PDF . DWG . DWF . IFC . ZIP`.

### 12. Adicionar modais no return (linha 751)

Adicionar `ObraListModal` com props para seleccao, remocao e criacao de novas obras.

### 13. Actualizar exports (linha 762)

Adicionar `ObraListModal` aos exports.

## Base de dados (migracao SQL)

Criar tabela `incompaticheck_obras` com RLS e adicionar coluna `obra_id` a `incompaticheck_projects` (se existir).

```sql
CREATE TABLE IF NOT EXISTS incompaticheck_obras (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  nome TEXT NOT NULL,
  cidade TEXT,
  fiscal TEXT,
  project_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE incompaticheck_obras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own obras" ON incompaticheck_obras
  FOR ALL USING (auth.uid() = user_id);
```

## Ficheiros modificados

| Ficheiro | Alteracao |
|---|---|
| `src/pages/app/IncompatiCheck.tsx` | Interface Obra, states, ObraListModal, handleUpload ZIP, header, sidebar, exports |
| Migracao SQL | Tabela incompaticheck_obras com RLS |

