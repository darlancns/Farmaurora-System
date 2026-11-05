import { createError, type H3Error } from "h3";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import {
  LIMITE_BLOQUEIO_MINUTOS,
  LIMITE_FALHAS_SENHA_ATUAL,
  LIMITE_JANELA_MINUTOS,
} from "#shared/constants/conta";

// Limite de tentativas ERRADAS da senha atual nos endpoints da própria conta (senha e e-mail), por usuário
// e por tipo de ação. O contador mora no Postgres (tabela conta_tentativas + funções RPC atômicas —
// supabase/migrations/20261105100000_conta_tentativas.sql); na Vercel a memória não é compartilhada.
//
// Este arquivo só conversa com as RPCs e NUNCA recebe senha nem e-mail: só o id da conta (que vem da
// sessão) e o tipo — por isso nada sensível pode vazar daqui, nem no log.
//
// FALHA ABERTA: se o banco/a função falhar (migration não aplicada, banco fora do ar), a operação segue
// sem limite e o erro vai pro log. O limite protege contra tentativa em massa, não é requisito de
// disponibilidade — e os endpoints já dependem do mesmo banco pra fazer o resto.

export type TipoLimiteConta = "senha" | "email";

/** Mensagem do 429 do limite — sem dizer quanto falta nem quantas tentativas foram feitas. */
export const MENSAGEM_LIMITE_TENTATIVAS = "Muitas tentativas. Tente novamente em alguns minutos.";

function registrarFalhaDoLimite(operacao: string, tipo: TipoLimiteConta, motivo: unknown): void {
  const detalhe =
    motivo !== null && typeof motivo === "object" && "message" in motivo
      ? String((motivo as { message: unknown }).message)
      : "erro desconhecido";
  console.error(`[conta] limite de tentativas indisponível, seguindo sem limite (${operacao}, ${tipo}) — ${detalhe}`);
}

/** true se há bloqueio vigente. Falha do banco → false (falha aberta). */
export async function estaBloqueado(userId: string, tipo: TipoLimiteConta): Promise<boolean> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("verificar_bloqueio_conta", {
      p_user: userId,
      p_tipo: tipo,
    });
    if (error) {
      registrarFalhaDoLimite("verificar", tipo, error);
      return false;
    }
    return data === true;
  } catch (e) {
    registrarFalhaDoLimite("verificar", tipo, e);
    return false;
  }
}

/** Soma uma falha (senha atual incorreta). Falha do banco só vai pro log. */
export async function registrarFalha(userId: string, tipo: TipoLimiteConta): Promise<void> {
  try {
    const { error } = await createSupabaseAdminClient().rpc("registrar_falha_conta", {
      p_user: userId,
      p_tipo: tipo,
      p_max: LIMITE_FALHAS_SENHA_ATUAL,
      p_janela: `${LIMITE_JANELA_MINUTOS} minutes`,
      p_bloqueio: `${LIMITE_BLOQUEIO_MINUTOS} minutes`,
    });
    if (error) registrarFalhaDoLimite("registrar", tipo, error);
  } catch (e) {
    registrarFalhaDoLimite("registrar", tipo, e);
  }
}

/** Senha certa: zera o contador daquele tipo. Falha do banco só vai pro log. */
export async function zerarFalhas(userId: string, tipo: TipoLimiteConta): Promise<void> {
  try {
    const { error } = await createSupabaseAdminClient().rpc("zerar_falhas_conta", { p_user: userId, p_tipo: tipo });
    if (error) registrarFalhaDoLimite("zerar", tipo, error);
  } catch (e) {
    registrarFalhaDoLimite("zerar", tipo, e);
  }
}

/** 429 do limite (independente do 429 do Supabase Auth, que tem mensagem própria). */
export function erroLimiteExcedido(): H3Error {
  return createError({ statusCode: 429, statusMessage: MENSAGEM_LIMITE_TENTATIVAS });
}
