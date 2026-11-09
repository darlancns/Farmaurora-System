import type { Dir, DirPatchDTO, NewDirDTO } from "../../shared/types/dir";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro, randomId } from "./storeKit";
import { colunasDeDir, montarDir, type DirRow, type MarcaFechamentoRestante } from "./dirMappers";
import { DirRegraError, erroContratoCambio, erroMarcacaoFechamentoRestante } from "./dirValidation";

/**
 * Persistência da DIR no Supabase — tabela `dir` (1 linha por PO; `po` NÃO é único).
 *
 * Mesmo molde de processosStore.ts: create/patch/delete são cada um UM comando numa única
 * linha (atômico), e `patchDir` é seletivo por campo. Mapeamento linha ↔ objeto em
 * `./dirMappers.ts`.
 *
 * Lista "Fechamentos restantes" (marcação no PO): quando `fechamentoRestante` vira true o SERVIDOR
 * grava `fechamento_restante_em` (agora) e `fechamento_restante_por` (usuário logado); ao virar false
 * os dois voltam a NULL. Marcar PO com operação encerrada é recusado (DirRegraError → 400).
 */

const TABELA = "dir";

// O PostgREST devolve no máximo 1000 linhas por requisição (padrão do Supabase). A DIR cresce
// ~50 POs por mês, então a listagem pagina em vez de truncar em silêncio.
const TAMANHO_PAGINA = 1000;

export async function listDir(): Promise<Dir[]> {
  const db = createSupabaseAdminClient();
  const todas: DirRow[] = [];

  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await db
      .from(TABELA)
      .select("*")
      .order("po", { ascending: false })
      .order("id", { ascending: true })
      .range(de, de + TAMANHO_PAGINA - 1);
    if (error) throw erro("listar a DIR", error);

    const pagina = (data ?? []) as DirRow[];
    todas.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA) break;
  }

  return todas.map(montarDir);
}

export async function createDir(input: NewDirDTO, por: string): Promise<Dir> {
  const mensagem = erroMarcacaoFechamentoRestante(input);
  if (mensagem) throw new DirRegraError(mensagem);
  const erroContrato = erroContratoCambio(input);
  if (erroContrato) throw new DirRegraError(erroContrato);

  const db = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const id = randomId("dir_");
  const marca: MarcaFechamentoRestante = { em: now, por };

  const row = { id, ...colunasDeDir(input, marca), created_at: now, updated_at: now };
  const { error } = await db.from(TABELA).insert(row);
  if (error) throw erro("criar registro da DIR", error);

  return montarDir(row as unknown as DirRow);
}

export async function patchDir(id: string, patch: DirPatchDTO, por: string): Promise<Dir | null> {
  const db = createSupabaseAdminClient();
  const now = new Date().toISOString();
  let marca: MarcaFechamentoRestante | undefined;

  // Contrato de câmbio só número. Só se lê o valor gravado quando o enviado NÃO cumpre a regra: um valor igual ao que
  // já está lá (anotação antiga em texto) não impede salvar os outros campos; qualquer outro valor inválido é 400.
  if (erroContratoCambio(patch)) {
    const { data, error } = await db.from(TABELA).select("id, contrato_cambio").eq("id", id);
    if (error) throw erro("buscar registro da DIR", error);

    const atual = (data ?? [])[0] as Pick<DirRow, "id" | "contrato_cambio"> | undefined;
    if (!atual) return null;

    const erroContrato = erroContratoCambio(patch, { contratoCambio: atual.contrato_cambio });
    if (erroContrato) throw new DirRegraError(erroContrato);
  }

  // Só mexer em fechamentoRestante exige conhecer o estado atual: a regra do PO encerrado vale sobre o
  // estado resultante, e quem já estava marcado não pode perder quem/quando marcou.
  if (patch.fechamentoRestante === true) {
    const { data, error } = await db
      .from(TABELA)
      .select("id, operacao_encerrada, fechamento_restante")
      .eq("id", id);
    if (error) throw erro("buscar registro da DIR", error);

    const atual = (data ?? [])[0] as Pick<DirRow, "id" | "operacao_encerrada" | "fechamento_restante"> | undefined;
    if (!atual) return null;

    const mensagem = erroMarcacaoFechamentoRestante(patch, { operacaoEncerrada: atual.operacao_encerrada === true });
    if (mensagem) throw new DirRegraError(mensagem);

    if (atual.fechamento_restante !== true) marca = { em: now, por };
  }

  // Um único UPDATE das colunas presentes no patch (+ updated_at). Atômico.
  const { data, error } = await db
    .from(TABELA)
    .update({ ...colunasDeDir(patch, marca), updated_at: now })
    .eq("id", id)
    .select("*");
  if (error) throw erro("atualizar registro da DIR", error);

  const row = (data ?? [])[0] as DirRow | undefined;
  return row ? montarDir(row) : null;
}

export async function deleteDir(id: string): Promise<boolean> {
  const db = createSupabaseAdminClient();

  const { data, error } = await db.from(TABELA).delete().eq("id", id).select("id");
  if (error) throw erro("excluir registro da DIR", error);

  return ((data ?? []) as unknown[]).length > 0;
}
