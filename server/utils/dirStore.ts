import type { Dir, DirPatchDTO, NewDirDTO } from "../../shared/types/dir";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro, randomId } from "./storeKit";
import { colunasDeDir, montarDir, type DirRow, type MarcaFechamentoRestante } from "./dirMappers";
import { DirRegraError, erroContratoCambio, erroMarcacaoFechamentoRestante } from "./dirValidation";
import { erroEnvioDir } from "../../shared/utils/dirEnvio";
import { erroDoConsultorEnviado } from "./consultoresCadastro";

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
  // Envio: só as opções do Follow-Up (ou vazio). Na criação não há valor antigo a tolerar.
  const erroEnvio = erroEnvioDir(input);
  if (erroEnvio) throw new DirRegraError(erroEnvio);
  // Consultor: só os ATIVOS do Cadastro (lista "consultores"). Na criação não há valor antigo a tolerar.
  const erroVendedor = await erroDoConsultorEnviado(input.vendedor, async () => null);
  if (erroVendedor) throw new DirRegraError(erroVendedor);

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

  // Envio: só as opções do Follow-Up (ou vazio). Mesma tolerância do contrato: um valor IGUAL ao gravado (ex.: "FEDEX FORMAL",
  // de antes da regra) não impede salvar os outros campos; qualquer outro valor inválido é 400. Só se lê o gravado quando
  // o enviado NÃO cumpre a regra.
  if (erroEnvioDir(patch)) {
    const { data, error } = await db.from(TABELA).select("id, envio").eq("id", id);
    if (error) throw erro("buscar registro da DIR", error);

    const atual = (data ?? [])[0] as Pick<DirRow, "id" | "envio"> | undefined;
    if (!atual) return null;

    const erroEnvio = erroEnvioDir(patch, { envio: atual.envio });
    if (erroEnvio) throw new DirRegraError(erroEnvio);
  }

  // Consultor (vendedor): só os ATIVOS do Cadastro. Um valor IGUAL ao gravado (consultor desativado, "A ser definido",
  // "Braulio (3RB)"…) não impede salvar os outros campos; qualquer outro valor fora da lista ativa é 400. Só se lê o
  // cadastro quando o corpo traz `vendedor`, e só se lê o registro quando o enviado NÃO é um consultor ativo.
  if (typeof patch.vendedor === "string") {
    let inexistente = false;
    const erroVendedor = await erroDoConsultorEnviado(patch.vendedor, async () => {
      const { data, error } = await db.from(TABELA).select("id, vendedor").eq("id", id);
      if (error) throw erro("buscar registro da DIR", error);

      const atual = (data ?? [])[0] as Pick<DirRow, "id" | "vendedor"> | undefined;
      if (!atual) inexistente = true;
      return atual?.vendedor ?? null;
    });
    if (erroVendedor) {
      if (inexistente) return null;
      throw new DirRegraError(erroVendedor);
    }
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

// ── O Encaminhar da Compra (server/utils/comprasEncaminhar.ts) ───────────────────────────────────────────────
// A DIR não é validada de novo aqui (quem monta o DTO é o mapa da compra, e a rota confere antes); o que este store garante é a
// gravação IDEMPOTENTE: o id da linha é determinístico (`dir_` + id da ordem) e o insert é "on conflict (id) do nothing".

/** Linhas da DIR (só `id` e `po`) com algum destes POs. Serve para a rota dizer QUAIS POs já existem, sem devolver mais nada. */
export async function listarLinhasDaDirPorPo(pos: readonly string[]): Promise<Array<{ id: string; po: string }>> {
  const achadas: Array<{ id: string; po: string }> = [];
  if (pos.length === 0) return achadas;
  const db = createSupabaseAdminClient();
  for (let i = 0; i < pos.length; i += 100) {
    const { data, error } = await db.from(TABELA).select("id, po").in("po", pos.slice(i, i + 100));
    if (error) throw erro("buscar os POs na DIR", error);
    achadas.push(...((data ?? []) as Array<{ id: string; po: string }>));
  }
  return achadas;
}

/**
 * Cria as linhas da DIR de uma compra num ÚNICO comando: `insert ... on conflict (id) do nothing`. Uma linha cujo id já existe (uma tentativa
 * anterior que parou antes de gravar o dir_id na ordem) NÃO é tocada nem duplicada: repetir é seguro. Sem nenhuma validação (ver acima).
 */
export async function inserirLinhasDaCompra(linhas: ReadonlyArray<{ id: string; dto: NewDirDTO }>, agoraIso: string): Promise<void> {
  if (linhas.length === 0) return;
  const db = createSupabaseAdminClient();
  const rows = linhas.map(({ id, dto }) => ({ id, ...colunasDeDir(dto), created_at: agoraIso, updated_at: agoraIso }));
  const { error } = await db.from(TABELA).upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw erro("criar as linhas da DIR a partir da compra", error);
}

export async function deleteDir(id: string): Promise<boolean> {
  const db = createSupabaseAdminClient();

  const { data, error } = await db.from(TABELA).delete().eq("id", id).select("id");
  if (error) throw erro("excluir registro da DIR", error);

  return ((data ?? []) as unknown[]).length > 0;
}
