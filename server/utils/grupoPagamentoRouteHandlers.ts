import { defineEventHandler, readBody, getRouterParam, getQuery, createError } from "h3";
import {
  listarGruposPagamento,
  criarGrupoPagamento,
  atualizarItemGrupo,
  editarItemGrupo,
  removerItemGrupo,
  pagarGrupoPagamento,
  getDespachantePix,
  getTransportadoraPix,
  salvarDespachantePix,
  salvarTransportadoraPix,
} from "./pagamentosStore";
import {
  isValidNovoGrupoPagamento,
  isValidAtualizarItemGrupo,
  isValidEditarItemGrupo,
  isValidSalvarGrupoPix,
} from "./pagamentoValidation";
import type { GrupoPagamento, TipoGrupoPagamento } from "../../shared/types/Pagamento";

/**
 * As rotas de Despachante e Transportadora são idênticas exceto por `tipo` (e,
 * na de PIX, qual store chamar) — ver auditoria da Round 7. `[id].patch`,
 * `item.patch`, `item.delete` e `pagar.patch` nem recebem `tipo`: operam só
 * por `grupoId`, então usam o MESMO handler (não uma factory) nos dois lados.
 */
interface GrupoPagamentoRouteConfig {
  tipo: TipoGrupoPagamento;
  labelErro: string;
  getPix: () => Promise<Record<string, string>>;
  salvarPix: (nome: string, chave: string) => Promise<Record<string, string>>;
}

export const DESPACHANTE: GrupoPagamentoRouteConfig = {
  tipo: "DESPACHANTE",
  labelErro: "despachante",
  getPix: getDespachantePix,
  salvarPix: salvarDespachantePix,
};

export const TRANSPORTADORA: GrupoPagamentoRouteConfig = {
  tipo: "TRANSPORTADORA",
  labelErro: "transportadora",
  getPix: getTransportadoraPix,
  salvarPix: salvarTransportadoraPix,
};

export function createListGruposHandler(cfg: GrupoPagamentoRouteConfig) {
  return defineEventHandler(async (): Promise<GrupoPagamento[]> => {
    const grupos = await listarGruposPagamento();
    return grupos.filter((g) => g.tipo === cfg.tipo);
  });
}

export function createCriarGrupoHandler(cfg: GrupoPagamentoRouteConfig) {
  return defineEventHandler(async (event): Promise<GrupoPagamento> => {
    const raw = await readBody(event);
    const body = { ...(raw as Record<string, unknown>), tipo: cfg.tipo };

    if (!isValidNovoGrupoPagamento(body)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Dados do pagamento de ${cfg.labelErro} inválidos ou incompletos.`,
      });
    }

    return await criarGrupoPagamento(body);
  });
}

export function createGetPixHandler(cfg: GrupoPagamentoRouteConfig) {
  return defineEventHandler(async (): Promise<Record<string, string>> => {
    return await cfg.getPix();
  });
}

export function createSalvarPixHandler(cfg: GrupoPagamentoRouteConfig) {
  return defineEventHandler(async (event): Promise<Record<string, string>> => {
    const body = await readBody(event);
    if (!isValidSalvarGrupoPix(body)) {
      throw createError({ statusCode: 400, statusMessage: "Dados da chave PIX inválidos." });
    }
    return await cfg.salvarPix(body.nome, body.chavePix);
  });
}

// Ciclo de status por item (Não pago -> Pago -> Complemento) — persiste a cada
// clique. Não move o grupo; isso é só o botão "Marcar grupo como pago".
export const atualizarStatusItemHandler = defineEventHandler(async (event): Promise<GrupoPagamento> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID do grupo não informado." });
  }

  const body = await readBody(event);
  if (!isValidAtualizarItemGrupo(body)) {
    throw createError({ statusCode: 400, statusMessage: "Dados do item inválidos." });
  }

  return await atualizarItemGrupo(id, body);
});

// Edita paciente/valor de um item do grupo (mantém o status).
export const editarItemGrupoHandler = defineEventHandler(async (event): Promise<GrupoPagamento> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID do grupo não informado." });
  }
  const body = await readBody(event);
  if (!isValidEditarItemGrupo(body)) {
    throw createError({ statusCode: 400, statusMessage: "Dados do item inválidos." });
  }
  return await editarItemGrupo(id, body);
});

// Remove um item (paciente) do grupo: DELETE .../{tipo}/{id}/item?index=N
// Se o grupo ficar vazio, ele é removido (resposta { grupo: null }).
export const removerItemGrupoHandler = defineEventHandler(async (event): Promise<{ grupo: GrupoPagamento | null }> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID do grupo não informado." });
  }
  const index = Number(getQuery(event).index);
  if (!Number.isInteger(index) || index < 0) {
    throw createError({ statusCode: 400, statusMessage: "Índice do item inválido." });
  }
  return { grupo: await removerItemGrupo(id, index) };
});

// Marca o grupo inteiro (todos os pacientes) como pago de uma vez e move para
// "Pagamentos realizados". Nunca item por item.
export const pagarGrupoHandler = defineEventHandler(async (event): Promise<GrupoPagamento> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID do grupo não informado." });
  }
  return await pagarGrupoPagamento(id);
});
