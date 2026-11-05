import { createError, type H3Event } from "h3";
import { createSupabaseAdminClient, createSupabaseAnonClient } from "./supabaseServerClient";
import { erroLimiteExcedido, estaBloqueado, registrarFalha, zerarFalhas, type TipoLimiteConta } from "./contaLimite";
import { notificarContaEditada } from "./notificacoesStore";
import type { AuthUser } from "#shared/types/auth";
import type { CampoContaEditado } from "#shared/types/conta";

// Peças compartilhadas dos endpoints da PRÓPRIA conta (server/api/auth/conta/**).

/**
 * Usuário da sessão. O id da conta vem SEMPRE daqui — nunca do body nem da rota. O prefixo
 * /api/auth/** só exige sessão (sem checagem de seção), então esta verificação é a defesa do handler.
 */
export function exigirUsuario(event: H3Event): AuthUser {
  const user = event.context.user as AuthUser | null | undefined;
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Não autenticado." });
  }
  return user;
}

const MENSAGEM_FALHA_AO_CONFERIR = "Não foi possível conferir a senha agora. Tente novamente em instantes.";

/**
 * Confere a senha atual da conta `userId` com um client anon descartável. Senha errada responde 400
 * (e não 401: 401 neste app significa "sessão ausente/expirada" e um cliente genérico poderia deslogar
 * a pessoa). A sessão criada pela conferência é encerrada só no escopo local, e a senha nunca é logada.
 *
 * O e-mail usado no login é buscado AGORA no Supabase (`auth.admin.getUserById`), não lido de
 * `event.context.user`: esse usuário vem do cache de 8s de server/middleware/auth.ts, que depois de uma
 * troca de e-mail ainda traz o ANTIGO — a conferência falharia com um "senha incorreta" falso. O `userId`
 * continua vindo só da sessão (quem chama passa `user.id`). Falha ao buscar a conta, ou conta sem e-mail,
 * vira um erro genérico (502) que não expõe e-mail nem detalhe do Supabase.
 *
 * Limite de tentativas ERRADAS (server/utils/contaLimite.ts), por usuário e por `tipo` de ação:
 * - o bloqueio é checado ANTES de qualquer chamada ao Supabase Auth (quem está bloqueado não gasta a
 *   cota de login, que todos os usuários dividem pelo IP de saída da Vercel) → 429 do limite;
 * - só "senha incorreta" conta como falha; 429 do Supabase, falha de rede/Auth e 5xx NÃO contam;
 * - senha certa zera o contador. Banco do limite indisponível → falha aberta (segue sem limite).
 */
export async function verificarSenhaAtual(userId: string, senha: string, tipo: TipoLimiteConta): Promise<void> {
  if (await estaBloqueado(userId, tipo)) throw erroLimiteExcedido();

  const { data, error: erroLeitura } = await createSupabaseAdminClient().auth.admin.getUserById(userId);
  const email = data?.user?.email;
  if (erroLeitura || !email) {
    throw createError({ statusCode: 502, statusMessage: MENSAGEM_FALHA_AO_CONFERIR });
  }

  const anon = createSupabaseAnonClient();
  try {
    const { error } = await anon.auth.signInWithPassword({ email, password: senha });
    if (!error) {
      await zerarFalhas(userId, tipo);
      return;
    }

    if (error.status === 429) {
      throw createError({
        statusCode: 429,
        statusMessage: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
      });
    }
    if (typeof error.status === "number" && error.status >= 400 && error.status < 500) {
      await registrarFalha(userId, tipo);
      throw createError({ statusCode: 400, statusMessage: "A senha atual está incorreta." });
    }
    throw createError({ statusCode: 502, statusMessage: MENSAGEM_FALHA_AO_CONFERIR });
  } finally {
    try {
      await anon.auth.signOut({ scope: "local" });
    } catch {
      // melhor esforço: o client é descartado e a sessão expira sozinha.
    }
  }
}

/** Nome mostrado nas notificações: o `nome` da conta; sem ele, a parte do e-mail antes do @ (como o GlobalHeader). */
export function nomeDeExibicao(user: Pick<AuthUser, "nome" | "email">): string {
  return user.nome?.trim() || user.email.split("@")[0] || "Uma conta";
}

/**
 * Notifica os administradores DEPOIS da edição já aplicada. Se a notificação falhar, a edição
 * continua valendo (nada é desfeito) e o erro é registrado sem dados da conta além do campo.
 */
export async function notificarEdicaoSemFalhar(user: AuthUser, campo: CampoContaEditado): Promise<void> {
  try {
    await notificarContaEditada({ id: user.id, nome: nomeDeExibicao(user) }, campo);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "erro desconhecido";
    console.error(`[conta] falha ao notificar os administradores (campo: ${campo}) — ${motivo}`);
  }
}
