import { defineEventHandler, readBody, getRouterParam, getQuery, createError } from "h3";
import {
  listarGruposPagamento,
  criarGrupoPagamento,
  atualizarItemGrupo,
  editarItemGrupo,
  removerItemGrupo,
  pagarGrupoPagamento,
  atualizarGrupoRealizado,
} from "./pagamentosStore";
import { pixDoCadastro, resolverDestinoGrupo } from "./cadastroPagamentos";
import {
  isValidNovoGrupoPagamento,
  isValidAtualizarItemGrupo,
  isValidEditarItemGrupo,
  isValidAtualizarGrupoRealizado,
} from "./pagamentoValidation";
import { podeVerPixCadastro } from "../../shared/utils/cadastroPix";
import type { AuthUser } from "../../shared/types/auth";
import type { GrupoPagamento, NovoGrupoPagamentoDTO, TipoGrupoPagamento } from "../../shared/types/Pagamento";

/**
 * As rotas de Despachante e Transportadora são idênticas exceto por `tipo` — ver auditoria da Round 7. A chave PIX é SÓ
 * LEITURA aqui (GET, vinda do Cadastro): quem a altera é o administrador, em Configurações → Cadastros. `[id].patch`,
 * `item.patch`, `item.delete` e `pagar.patch` nem recebem `tipo`: operam só
 * por `grupoId`, então usam o MESMO handler (não uma factory) nos dois lados.
 */
interface GrupoPagamentoRouteConfig {
  tipo: TipoGrupoPagamento;
  labelErro: string;
}

export const DESPACHANTE: GrupoPagamentoRouteConfig = {
  tipo: "DESPACHANTE",
  labelErro: "despachante",
};

export const TRANSPORTADORA: GrupoPagamentoRouteConfig = {
  tipo: "TRANSPORTADORA",
  labelErro: "transportadora",
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

    // O nome tem de existir e estar ATIVO no Cadastro do tipo (casado por chaveCadastro); grava-se o nome como está no
    // Cadastro e a CÓPIA da chave PIX do Cadastro (instantâneo histórico). A chave que a tela mandar é ignorada.
    const destino = await resolverDestinoGrupo(cfg.tipo, body.nomeGrupo);
    const dto: NovoGrupoPagamentoDTO = { ...body, nomeGrupo: destino.nomeGrupo };
    if (destino.chavePix) dto.chavePix = destino.chavePix;
    else delete dto.chavePix;

    return await criarGrupoPagamento(dto);
  });
}

// Chave PIX por nome, lida do Cadastro: só para o administrador e para quem LÊ a seção Pagamentos (a mesma regra dos
// Cadastros, shared/utils/cadastroPix.ts). O middleware já exige leitura de Pagamentos; esta checagem é a segunda camada.
export function createGetPixHandler(cfg: GrupoPagamentoRouteConfig) {
  return defineEventHandler(async (event): Promise<Record<string, string>> => {
    const user: AuthUser | null | undefined = event.context.user;
    if (!podeVerPixCadastro(user)) {
      throw createError({ statusCode: 403, statusMessage: "Sem permissão para ver a chave PIX." });
    }
    return await pixDoCadastro(cfg.tipo);
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

// Corrige nomeGrupo + pagoEm de um grupo já pago, em "Pagamentos
// realizados" — edição pontual dos dois campos, não reabre o grupo nem mexe
// em itens/status.
export const editarGrupoRealizadoHandler = defineEventHandler(async (event): Promise<GrupoPagamento> => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID do grupo não informado." });
  }
  const body = await readBody(event);
  if (!isValidAtualizarGrupoRealizado(body)) {
    throw createError({ statusCode: 400, statusMessage: "Dados do pagamento realizado inválidos." });
  }
  return await atualizarGrupoRealizado(id, body);
});
