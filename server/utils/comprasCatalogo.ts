import { TABELA_CADASTRO } from "../../shared/constants/cadastros";
import { MODAIS_ENVIO } from "../../shared/constants/processos";
import type { Compra, CompraEstado, OrdemCompraEstado } from "../../shared/types/compra";
import { chaveCadastro } from "../../shared/utils/cadastroNome";
import { listarConsultoresAtivos } from "./consultoresCadastro";
import { ComprasRegraError } from "./comprasStore";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro } from "./storeKit";

/**
 * A ÚNICA porta das Compras para as tabelas `cadastro_*` (fornecedores, despachantes, cias aéreas, ...). A guarda
 * tests/unit/cadastrosPixNenhumaOutraRota.spec.ts permite este arquivo (como consultoresCadastro.ts) e TRAVA o que ele pode fazer:
 *  - só LÊ, e só colunas explícitas SEM chave PIX (nunca `*`, nunca chave_pix) — as listas de despachantes e transportadoras daqui
 *    NÃO têm o campo, então nenhuma rota de Compras consegue devolvê-lo;
 *  - só itens ATIVOS (`ativo = true`);
 *  - não escreve em tabela cadastro_* (a criação de temperatura, mais adiante, passa pelo store dos Cadastros).
 * Tudo que as rotas de Compras precisam do Cadastro entra e sai por aqui.
 */

type Db = ReturnType<typeof createSupabaseAdminClient>;

const TAMANHO_PAGINA = 1000;

/** Lê TODAS as linhas ativas da tabela, só das colunas pedidas, pagina de 1000 em 1000 (o PostgREST corta em silêncio), por ordem estável. */
async function lerAtivos<T>(db: Db, tabela: string, colunas: string, acao: string): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await db
      .from(tabela)
      .select(colunas)
      .eq("ativo", true)
      .order("nome_chave", { ascending: true })
      .order("id", { ascending: true })
      .range(de, de + TAMANHO_PAGINA - 1);
    if (error) throw erro(acao, error);
    const pagina = (data ?? []) as unknown as T[];
    todas.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA) break;
  }
  return todas;
}

/** Nomes dos fornecedores ativos. */
export async function nomesDeFornecedoresAtivos(): Promise<string[]> {
  const itens = await lerAtivos<{ nome: string }>(createSupabaseAdminClient(), TABELA_CADASTRO.fornecedores, "nome", "listar os fornecedores ativos");
  return itens.map((i) => i.nome);
}

/** Nomes dos despachantes ativos (SÓ o nome: a chave PIX nem é lida). */
export async function nomesDeDespachantesAtivos(): Promise<string[]> {
  const itens = await lerAtivos<{ nome: string }>(createSupabaseAdminClient(), TABELA_CADASTRO.despachantes, "nome", "listar os despachantes ativos");
  return itens.map((i) => i.nome);
}

/** Nomes das cias aéreas ativas. */
export async function nomesDeCiasAereasAtivas(): Promise<string[]> {
  const itens = await lerAtivos<{ nome: string }>(createSupabaseAdminClient(), TABELA_CADASTRO["cias-aereas"], "nome", "listar as cias aéreas ativas");
  return itens.map((i) => i.nome);
}

// ── Validação do estado da compra contra os Cadastros ────────────────────────────────────────────────────────

export const MENSAGEM_VENDEDOR_INVALIDO = "Vendedor inválido: escolha um consultor ativo do Cadastro.";
export const MENSAGEM_DESPACHANTE_INVALIDO = "Despachante inválido: escolha um despachante ativo do Cadastro.";
const mensagemFornecedorInvalido = (n: number): string => `Ordem ${n}: fornecedor inválido: escolha um fornecedor ativo do Cadastro.`;
const mensagemCiaInvalida = (n: number): string => `Ordem ${n}: cia aérea inválida: escolha uma cia aérea ativa do Cadastro.`;
const mensagemEnvioInvalido = (n: number): string => `Ordem ${n}: envio inválido: escolha ${MODAIS_ENVIO.join(", ")}.`;

/** Lê cada lista do Cadastro no máximo UMA vez por validação (e só se algum campo a pedir). */
function umaVez<T>(ler: () => Promise<T>): () => Promise<T> {
  let promessa: Promise<T> | null = null;
  return () => (promessa ??= ler());
}

/**
 * Vendedor, despachante, fornecedor e cia aérea (quando PREENCHIDOS) precisam ser itens ATIVOS do Cadastro, comparados pela chave
 * (sem acento, caixa nem espaços repetidos) — e o valor gravado passa a ser o NOME do Cadastro. O envio precisa ser um dos modais
 * fixos. Medicamento e temperatura NÃO são validados (podem ser do pré-cadastro ou uma temperatura nova).
 *
 * Tolerância a dado antigo (como no consultor do Follow-Up): o valor IGUAL ao que a compra já tem é aceito, mesmo que o item tenha
 * sido desativado depois — senão a compra ficaria impossível de salvar. Só um valor NOVO precisa ser ativo.
 * 422 com a mensagem do campo. Devolve o estado com os nomes do Cadastro; não altera o recebido.
 */
export async function validarEstadoContraCadastros(estado: CompraEstado, atual: Compra): Promise<CompraEstado> {
  const consultores = umaVez(() => listarConsultoresAtivos());
  const despachantes = umaVez(() => nomesDeDespachantesAtivos());
  const fornecedores = umaVez(() => nomesDeFornecedoresAtivos());
  const cias = umaVez(() => nomesDeCiasAereasAtivas());

  async function resolver(valor: string, valorAtual: string, lista: () => Promise<string[]>, mensagem: string): Promise<string> {
    if (valor === "" || valor === valorAtual) return valor;
    const achado = (await lista()).find((nome) => chaveCadastro(nome) === chaveCadastro(valor));
    if (achado === undefined) throw new ComprasRegraError(mensagem, 422);
    return achado;
  }

  const campos = { ...estado.campos };
  if (campos.vendedor !== undefined) campos.vendedor = await resolver(campos.vendedor, atual.vendedor, consultores, MENSAGEM_VENDEDOR_INVALIDO);
  if (campos.despachante !== undefined) campos.despachante = await resolver(campos.despachante, atual.despachante, despachantes, MENSAGEM_DESPACHANTE_INVALIDO);

  let ordens: OrdemCompraEstado[] | undefined;
  if (estado.ordens) {
    ordens = [];
    for (const [i, o] of estado.ordens.entries()) {
      const antes = atual.ordens.find((x) => x.id === o.id);
      const n = i + 1;
      ordens.push({
        ...o,
        fornecedor: await resolver(o.fornecedor, antes?.fornecedor ?? "", fornecedores, mensagemFornecedorInvalido(n)),
        cia: await resolver(o.cia, antes?.cia ?? "", cias, mensagemCiaInvalida(n)),
        envio: await resolver(o.envio, antes?.envio ?? "", async () => [...MODAIS_ENVIO], mensagemEnvioInvalido(n)),
        itens: o.itens,
      });
    }
  }

  return { ...estado, campos, ...(ordens ? { ordens } : {}) };
}
