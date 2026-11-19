import { erroConsultor, nomesConsultoresAtivos, type ItemConsultor } from "../../shared/utils/consultorRegra";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro } from "./storeKit";

/**
 * Consultores do Cadastro (tabela `cadastro_consultores`, lista "consultores" em Configurações → Cadastros) vistos pelo servidor:
 * a ÚNICA fonte de consultores para Contas, Follow-Up, Prestação e DIR. Regras puras em shared/utils/consultorRegra.ts.
 *
 * Só leitura, e só as colunas `nome` e `ativo`. Fica FORA do store dos Cadastros de propósito: aquele store é o único caminho das
 * listas com chave PIX (guarda em tests/unit/cadastrosPixNenhumaOutraRota.spec.ts), e a lista de consultores não tem PIX.
 */
const TABELA_CONSULTORES = "cadastro_consultores";

/** Todos os consultores (ativos e inativos). */
export async function listarConsultores(): Promise<ItemConsultor[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from(TABELA_CONSULTORES).select("nome, ativo");
  if (error) throw erro("listar os consultores do Cadastro", error);
  return ((data ?? []) as Array<{ nome: string; ativo: boolean }>).map((row) => ({ nome: row.nome, ativo: row.ativo === true }));
}

/** Nomes dos consultores ativos, em ordem alfabética pt-BR. */
export async function listarConsultoresAtivos(): Promise<string[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from(TABELA_CONSULTORES).select("nome, ativo").eq("ativo", true);
  if (error) throw erro("listar os consultores ativos do Cadastro", error);

  const itens = ((data ?? []) as Array<{ nome: string; ativo: boolean }>).map((row) => ({ nome: row.nome, ativo: row.ativo === true }));
  return nomesConsultoresAtivos(itens);
}

/**
 * Valor de consultor de uma GRAVAÇÃO (Follow-Up, Prestação, DIR): precisa ser consultor ATIVO do Cadastro; o valor igual ao que o
 * registro já tem é aceito (`lerAtual` só é chamado quando o enviado não é um ativo). Devolve a mensagem do 400 ou null.
 * Falha ao ler o Cadastro sobe como erro (nunca vira "aceito").
 */
export async function erroDoConsultorEnviado(valor: string, lerAtual: () => Promise<string | null>): Promise<string | null> {
  const ativos = await listarConsultoresAtivos();
  if (erroConsultor(valor, ativos) === null) return null;
  return erroConsultor(valor, ativos, { consultor: await lerAtual() });
}

// ── Conta de login ligada a um consultor ─────────────────────────────────────────────────────────────────
// `app_metadata.consultorNome` só vale se o nome EXISTE no Cadastro (ativo OU inativo: a conta de um consultor desativado
// continua funcionando; quem bloqueia o login é desativar a conta). Esta checagem roda a cada requisição de conta de consultor
// (server/middleware/auth.ts), por isso há um cache em memória CURTO, só de ACERTOS: nome achado vale por 30 s; nome que não está
// no cache sempre relê o banco antes de ser recusado (um consultor recém-criado ou renomeado não espera o cache vencer).

export const CONSULTOR_CACHE_TTL_MS = 30_000;

const acertos = new Map<string, number>(); // nome → quando o acerto vence

/** Esquece um nome (ou todos): o renomear chama para o nome antigo deixar de valer na hora, neste processo. */
export function esquecerConsultorEmCache(nome?: string): void {
  if (nome === undefined) acertos.clear();
  else acertos.delete(nome);
}

/** O nome existe no Cadastro (ativo ou inativo), comparação exata? Acerto cacheado por 30 s; erro do banco sobe. */
export async function consultorExisteNoCadastro(nome: string, agora: number = Date.now()): Promise<boolean> {
  const venceEm = acertos.get(nome);
  if (venceEm !== undefined && venceEm > agora) return true;
  if (venceEm !== undefined) acertos.delete(nome); // vencido: não deixa lixo no Map

  const db = createSupabaseAdminClient();
  const { data, error } = await db.from(TABELA_CONSULTORES).select("id").eq("nome", nome).limit(1);
  if (error) throw erro("conferir o consultor no Cadastro", error);

  const achou = ((data ?? []) as unknown[]).length > 0;
  if (achou) acertos.set(nome, agora + CONSULTOR_CACHE_TTL_MS);
  return achou;
}
