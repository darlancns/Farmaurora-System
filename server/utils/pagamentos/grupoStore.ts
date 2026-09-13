import { createError } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AtualizarItemGrupoDTO,
  EditarItemGrupoDTO,
  EmpresaPagamento,
  GrupoPagamento,
  ItemGrupoPagamento,
  NovoGrupoPagamentoDTO,
} from "../../../shared/types/Pagamento";
import { createSupabaseAdminClient } from "../supabaseServerClient";
import { erro, num, randomId } from "../storeKit";
import { isTransicaoStatusItemValida } from "../pagamentoValidation";
import {
  isNomeConhecido,
  salvarDespachantePix,
  salvarTransportadoraPix,
} from "../pagamentosPixStore";

/**
 * Despachante / Transportadora (grupos) — Supabase, tabela `pagamento_grupos`
 * (itens em jsonb).
 *
 * Regra de negócio preservada exatamente (ver investigação, seção 3d): status
 * do item é gravação direta e agnóstica (sem ciclo no servidor);
 * `pagarGrupoPagamento` seta realizado/pagoEm e promove NAO_PAGO→PAGO
 * (COMPLEMENTO fica como está). Operações de grupo são uma linha só (atômicas).
 */

const T_GRUPOS = "pagamento_grupos";

interface GrupoRow {
  id: string;
  tipo: GrupoPagamento["tipo"];
  data: string;
  empresa: EmpresaPagamento;
  nome_grupo: string;
  chave_pix: string | null;
  itens: ItemGrupoPagamento[] | null;
  realizado: boolean;
  pago_em: string | null;
  created_at: string;
}

function montarGrupo(row: GrupoRow): GrupoPagamento {
  const grupo: GrupoPagamento = {
    id: row.id,
    tipo: row.tipo,
    data: row.data,
    empresa: row.empresa,
    nomeGrupo: row.nome_grupo,
    itens: (row.itens ?? []).map((i) => ({
      paciente: i.paciente,
      valor: num(i.valor),
      status: i.status,
    })),
    realizado: row.realizado,
    pagoEm: row.pago_em,
    createdAt: row.created_at,
  };
  if (row.chave_pix != null) grupo.chavePix = row.chave_pix;
  return grupo;
}

async function acharGrupoRow(db: SupabaseClient, grupoId: string): Promise<GrupoRow> {
  const res = await db.from(T_GRUPOS).select("*").eq("id", grupoId).maybeSingle();
  if (res.error) throw erro("buscar grupo", res.error);
  if (!res.data) throw createError({ statusCode: 404, statusMessage: "Grupo não encontrado." });
  return res.data as GrupoRow;
}

export async function listarGruposPagamento(): Promise<GrupoPagamento[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from(T_GRUPOS)
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (error) throw erro("listar grupos", error);
  return ((data ?? []) as GrupoRow[]).map(montarGrupo);
}

export async function criarGrupoPagamento(dto: NovoGrupoPagamentoDTO): Promise<GrupoPagamento> {
  // Efeito colateral PIX (file-based, inalterado): chave de nome conhecido vira
  // o novo padrão para os próximos pagamentos.
  if (dto.chavePix && isNomeConhecido(dto.tipo, dto.nomeGrupo)) {
    if (dto.tipo === "DESPACHANTE") await salvarDespachantePix(dto.nomeGrupo, dto.chavePix);
    else await salvarTransportadoraPix(dto.nomeGrupo, dto.chavePix);
  }

  const db = createSupabaseAdminClient();

  const existRes = await db
    .from(T_GRUPOS)
    .select("*")
    .eq("realizado", false)
    .eq("tipo", dto.tipo)
    .eq("data", dto.data)
    .eq("empresa", dto.empresa)
    .eq("nome_grupo", dto.nomeGrupo)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(1);
  if (existRes.error) throw erro("buscar grupo aberto", existRes.error);
  const existente = (existRes.data ?? [])[0] as GrupoRow | undefined;

  const novosItens: ItemGrupoPagamento[] = dto.itens.map((item) => ({
    paciente: item.paciente,
    valor: item.valor,
    status: "NAO_PAGO",
  }));

  if (existente) {
    const itens = [...(existente.itens ?? []), ...novosItens];
    const patch: Record<string, unknown> = { itens };
    if (dto.chavePix) patch.chave_pix = dto.chavePix;
    const u = await db.from(T_GRUPOS).update(patch).eq("id", existente.id).select("*");
    if (u.error) throw erro("anexar itens ao grupo", u.error);
    return montarGrupo((u.data ?? [])[0] as GrupoRow);
  }

  const id = randomId("grp_");
  const createdAt = new Date().toISOString();
  const ins = await db
    .from(T_GRUPOS)
    .insert({
      id,
      tipo: dto.tipo,
      data: dto.data,
      empresa: dto.empresa,
      nome_grupo: dto.nomeGrupo,
      chave_pix: dto.chavePix ?? null,
      itens: novosItens,
      realizado: false,
      pago_em: null,
      created_at: createdAt,
    })
    .select("*");
  if (ins.error) throw erro("criar grupo", ins.error);
  return montarGrupo((ins.data ?? [])[0] as GrupoRow);
}

// Regra 3d — status do item segue o ciclo clicável NAO_PAGO <-> COMPLEMENTO.
// PAGO só entra via `pagarGrupoPagamento` ("Marcar grupo como pago"). Não move o grupo.
export async function atualizarItemGrupo(
  grupoId: string,
  dto: AtualizarItemGrupoDTO,
): Promise<GrupoPagamento> {
  const db = createSupabaseAdminClient();
  const row = await acharGrupoRow(db, grupoId);

  const itens = [...(row.itens ?? [])];
  const item = itens[dto.index];
  if (!item) throw createError({ statusCode: 400, statusMessage: "Item do grupo inexistente." });

  // Só as duas transições do ciclo clicável são aceitas aqui. Qualquer outra
  // (setar PAGO, PAGO->qualquer, ou "mesmo status") é rejeitada — PAGO é
  // exclusivamente responsabilidade de `pagarGrupoPagamento`.
  if (!isTransicaoStatusItemValida(item.status, dto.status)) {
    throw createError({
      statusCode: 400,
      statusMessage:
        `Transição de status inválida (${item.status} → ${dto.status}). ` +
        `O ciclo do item é "Não pago" ↔ "Complemento"; "Pago" só via "Marcar grupo como pago".`,
    });
  }

  itens[dto.index] = { ...item, status: dto.status };

  const u = await db.from(T_GRUPOS).update({ itens }).eq("id", grupoId).select("*");
  if (u.error) throw erro("atualizar status do item", u.error);
  return montarGrupo((u.data ?? [])[0] as GrupoRow);
}

export async function editarItemGrupo(
  grupoId: string,
  dto: EditarItemGrupoDTO,
): Promise<GrupoPagamento> {
  const db = createSupabaseAdminClient();
  const row = await acharGrupoRow(db, grupoId);

  const itens = [...(row.itens ?? [])];
  const item = itens[dto.index];
  if (!item) throw createError({ statusCode: 400, statusMessage: "Item do grupo inexistente." });
  itens[dto.index] = { ...item, paciente: dto.paciente, valor: dto.valor };

  const u = await db.from(T_GRUPOS).update({ itens }).eq("id", grupoId).select("*");
  if (u.error) throw erro("editar item do grupo", u.error);
  return montarGrupo((u.data ?? [])[0] as GrupoRow);
}

export async function removerItemGrupo(
  grupoId: string,
  index: number,
): Promise<GrupoPagamento | null> {
  const db = createSupabaseAdminClient();
  const row = await acharGrupoRow(db, grupoId);

  const itens = [...(row.itens ?? [])];
  if (!itens[index]) throw createError({ statusCode: 400, statusMessage: "Item do grupo inexistente." });
  itens.splice(index, 1);

  if (!itens.length) {
    const del = await db.from(T_GRUPOS).delete().eq("id", grupoId);
    if (del.error) throw erro("excluir grupo vazio", del.error);
    return null;
  }

  const u = await db.from(T_GRUPOS).update({ itens }).eq("id", grupoId).select("*");
  if (u.error) throw erro("remover item do grupo", u.error);
  return montarGrupo((u.data ?? [])[0] as GrupoRow);
}

// Regra 3d — fecha o grupo inteiro: realizado/pagoEm + promove NAO_PAGO → PAGO
// (COMPLEMENTO fica como está).
export async function pagarGrupoPagamento(grupoId: string): Promise<GrupoPagamento> {
  const db = createSupabaseAdminClient();
  const row = await acharGrupoRow(db, grupoId);

  const itens = (row.itens ?? []).map((i) =>
    i.status === "NAO_PAGO" ? { ...i, status: "PAGO" as const } : i,
  );

  const u = await db
    .from(T_GRUPOS)
    .update({ realizado: true, pago_em: new Date().toISOString(), itens })
    .eq("id", grupoId)
    .select("*");
  if (u.error) throw erro("pagar grupo", u.error);
  return montarGrupo((u.data ?? [])[0] as GrupoRow);
}
