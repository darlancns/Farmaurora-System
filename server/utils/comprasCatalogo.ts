import { TABELA_CADASTRO } from "../../shared/constants/cadastros";
import { MODAIS_ENVIO } from "../../shared/constants/processos";
import type { Compra, CompraEstado, OpcoesCompra, OrdemCompraEstado, PaginaMedicamentos } from "../../shared/types/compra";
import type { ConsultaMedicamentos } from "../../shared/utils/compraValidacao";
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
 *  - só itens ATIVOS (`ativo = true`), com UMA exceção: `buscarMedicamentoPorNome` enxerga também o inativo (para o pré-cadastro saber que
 *    o nome já existe no Cadastro e a tela não pedir duplicata);
 *  - não escreve em tabela cadastro_* (a criação de temperatura passa pelo store dos Cadastros, em comprasTemperatura.ts).
 * Tudo que as rotas de Compras precisam do Cadastro entra e sai por aqui.
 */

type Db = ReturnType<typeof createSupabaseAdminClient>;

const TAMANHO_PAGINA = 1000;

interface OpcoesLeitura {
  /** Texto já normalizado (chave do Cadastro, sem % nem _): filtra por `nome_chave` contendo o texto. */
  busca?: string;
  /** Só uma faixa: `quantidade` linhas a partir da `de`. Sem isto, lê TODAS (de 1000 em 1000). */
  de?: number;
  quantidade?: number;
}

/**
 * Lê as linhas ATIVAS da tabela, só das colunas pedidas, por ordem estável (nome_chave, id). Sem faixa, lê TODAS, de 1000 em 1000 (o
 * PostgREST corta em silêncio no teto). É o ÚNICO `.from(` deste arquivo: tudo que as Compras leem dos Cadastros passa por aqui.
 */
async function lerAtivos<T>(db: Db, tabela: string, colunas: string, acao: string, opcoes: OpcoesLeitura = {}): Promise<T[]> {
  const faixa = async (de: number, ate: number): Promise<T[]> => {
    let consulta = db.from(tabela).select(colunas).eq("ativo", true);
    if (opcoes.busca) consulta = consulta.ilike("nome_chave", `%${opcoes.busca}%`);
    const { data, error } = await consulta.order("nome_chave", { ascending: true }).order("id", { ascending: true }).range(de, ate);
    if (error) throw erro(acao, error);
    return (data ?? []) as unknown as T[];
  };

  if (opcoes.quantidade !== undefined) {
    const de = opcoes.de ?? 0;
    return faixa(de, de + opcoes.quantidade - 1);
  }
  const todas: T[] = [];
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const pagina = await faixa(de, de + TAMANHO_PAGINA - 1);
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

// ── Opções do formulário (GET /api/compras/opcoes) ────────────────────────────────────────────────────────────

/** As colunas lidas de cada lista para o formulário: explícitas, sem `*` e SEM chave PIX (despachantes e transportadoras não a têm aqui). */
export const COLUNAS_OPCOES = {
  fornecedores: "nome, pais, prazo_alerta_dias, sem_alerta",
  despachantes: "nome, contato_nome, telefone, email",
  ciasAereas: "nome",
  transportadoras: "nome",
  temperaturas: "nome",
  medicamentos: "id, nome, temperatura",
} as const;

const textoOuVazio = (v: string | null | undefined): string => v ?? "";

/**
 * UMA página de medicamentos ATIVOS do Cadastro (`id, nome, temperatura`), por nome_chave, com a busca e o limite da consulta. Lê uma linha
 * a mais que o limite para saber se há próxima página sem contar a tabela. É o que a rota leve GET /api/compras/opcoes/medicamentos devolve
 * (e a parte de medicamentos da rota geral): nenhuma outra lista, nunca chave PIX.
 */
export async function listarMedicamentosDeCompra(consulta: ConsultaMedicamentos): Promise<PaginaMedicamentos> {
  const linhas = await lerAtivos<{ id: string; nome: string; temperatura: string | null }>(
    createSupabaseAdminClient(),
    TABELA_CADASTRO.medicamentos,
    COLUNAS_OPCOES.medicamentos,
    "listar os medicamentos ativos",
    { busca: consulta.q, de: (consulta.pagina - 1) * consulta.limite, quantidade: consulta.limite + 1 },
  );
  return {
    itens: linhas.slice(0, consulta.limite).map((m) => ({ id: m.id, nome: m.nome, temperatura: textoOuVazio(m.temperatura) })),
    pagina: consulta.pagina,
    limite: consulta.limite,
    temMais: linhas.length > consulta.limite,
    q: consulta.q,
  };
}

/** O formulário de Compras: as listas ativas (só os campos necessários) e UMA página de medicamentos (busca e limite da consulta). */
export async function listarOpcoesDeCompra(consulta: ConsultaMedicamentos): Promise<OpcoesCompra> {
  const db = createSupabaseAdminClient();
  const [fornecedores, despachantes, ciasAereas, transportadoras, temperaturas, consultores, medicamentos] = await Promise.all([
    lerAtivos<{ nome: string; pais: string | null; prazo_alerta_dias: number | string | null; sem_alerta: boolean }>(
      db,
      TABELA_CADASTRO.fornecedores,
      COLUNAS_OPCOES.fornecedores,
      "listar os fornecedores ativos",
    ),
    lerAtivos<{ nome: string; contato_nome: string | null; telefone: string | null; email: string | null }>(
      db,
      TABELA_CADASTRO.despachantes,
      COLUNAS_OPCOES.despachantes,
      "listar os despachantes ativos",
    ),
    lerAtivos<{ nome: string }>(db, TABELA_CADASTRO["cias-aereas"], COLUNAS_OPCOES.ciasAereas, "listar as cias aéreas ativas"),
    lerAtivos<{ nome: string }>(db, TABELA_CADASTRO.transportadoras, COLUNAS_OPCOES.transportadoras, "listar as transportadoras ativas"),
    lerAtivos<{ nome: string }>(db, TABELA_CADASTRO.temperaturas, COLUNAS_OPCOES.temperaturas, "listar as temperaturas ativas"),
    listarConsultoresAtivos(),
    listarMedicamentosDeCompra(consulta),
  ]);

  return {
    fornecedores: fornecedores.map((f) => ({
      nome: f.nome,
      pais: textoOuVazio(f.pais),
      prazoAlertaDias: f.prazo_alerta_dias === null || f.prazo_alerta_dias === undefined ? null : Number(f.prazo_alerta_dias),
      semAlerta: f.sem_alerta === true,
    })),
    despachantes: despachantes.map((d) => ({
      nome: d.nome,
      contatoNome: textoOuVazio(d.contato_nome),
      telefone: textoOuVazio(d.telefone),
      email: textoOuVazio(d.email),
    })),
    ciasAereas: ciasAereas.map((c) => ({ nome: c.nome })),
    transportadoras: transportadoras.map((t) => ({ nome: t.nome })),
    consultores: consultores.map((nome) => ({ nome })),
    temperaturas: temperaturas.map((t) => ({ nome: t.nome })),
    medicamentos,
  };
}

/**
 * O medicamento do Cadastro com esta CHAVE (chaveCadastro do nome), ativo OU inativo (a `nome_chave` é única contando os inativos, então
 * um inativo também impede criar o mesmo nome). Só leitura, só `id, nome, temperatura, ativo`. null se não existe.
 */
export async function buscarMedicamentoPorNome(chave: string): Promise<{ id: string; nome: string; temperatura: string; ativo: boolean } | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from(TABELA_CADASTRO.medicamentos)
    .select("id, nome, temperatura, ativo")
    .eq("nome_chave", chave);
  if (error) throw erro("buscar o medicamento no Cadastro", error);
  const row = ((data ?? []) as Array<{ id: string; nome: string; temperatura: string | null; ativo: boolean }>)[0];
  return row ? { id: row.id, nome: row.nome, temperatura: row.temperatura ?? "", ativo: row.ativo === true } : null;
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
