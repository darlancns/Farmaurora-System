import { TABELA_CADASTRO } from "../../shared/constants/cadastros";
import { BRANDS_MEDICAMENTO, EMPRESAS_PROCESSO, MODAIS_ENVIO, ciasAereasDoModal } from "../../shared/constants/processos";
import type { Compra, CompraEstado, ItemCompraEstado, OpcoesCompra, PaginaMedicamentos } from "../../shared/types/compra";
import type { ConsultaMedicamentos } from "../../shared/utils/compraValidacao";
import { chaveCadastro } from "../../shared/utils/cadastroNome";
import { listarConsultoresAtivos } from "./consultoresCadastro";
import { ComprasRegraError } from "./comprasErro";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro } from "./storeKit";

/**
 * A ÚNICA porta das Compras para as tabelas `cadastro_*` (fornecedores, despachantes, temperaturas, consultores, medicamentos). A guarda
 * tests/unit/cadastrosPixNenhumaOutraRota.spec.ts permite este arquivo (como consultoresCadastro.ts) e TRAVA o que ele pode fazer:
 *  - só LÊ, e só colunas explícitas SEM chave PIX (nunca `*`, nunca chave_pix) — a lista de despachantes daqui
 *    NÃO tem o campo, então nenhuma rota de Compras consegue devolvê-lo;
 *  - só itens ATIVOS (`ativo = true`), com DUAS exceções que enxergam também o inativo: `buscarMedicamentoPorNome` (para o pré-cadastro saber
 *    que o nome já existe no Cadastro e a tela não pedir duplicata) e `nomesDosMedicamentosDoCadastro` (o nome de um medicamento já ligado a
 *    um item da compra, mesmo que depois tenha sido desativado);
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

// ── Opções do formulário (GET /api/compras/opcoes) ────────────────────────────────────────────────────────────

/** As colunas lidas de cada lista para o formulário: explícitas, sem `*` e SEM chave PIX (a de despachantes não a tem aqui). */
export const COLUNAS_OPCOES = {
  fornecedores: "nome",
  despachantes: "nome, contato_nome, telefone, email",
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
  const [fornecedores, despachantes, temperaturas, consultores, medicamentos] = await Promise.all([
    lerAtivos<{ nome: string }>(db, TABELA_CADASTRO.fornecedores, COLUNAS_OPCOES.fornecedores, "listar os fornecedores ativos"),
    lerAtivos<{ nome: string; contato_nome: string | null; telefone: string | null; email: string | null }>(
      db,
      TABELA_CADASTRO.despachantes,
      COLUNAS_OPCOES.despachantes,
      "listar os despachantes ativos",
    ),
    lerAtivos<{ nome: string }>(db, TABELA_CADASTRO.temperaturas, COLUNAS_OPCOES.temperaturas, "listar as temperaturas ativas"),
    listarConsultoresAtivos(),
    listarMedicamentosDeCompra(consulta),
  ]);

  return {
    fornecedores: fornecedores.map((f) => ({ nome: f.nome })),
    despachantes: despachantes.map((d) => ({
      nome: d.nome,
      contatoNome: textoOuVazio(d.contato_nome),
      telefone: textoOuVazio(d.telefone),
      email: textoOuVazio(d.email),
    })),
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

/**
 * O nome, no Cadastro, de cada medicamento pedido (id → nome), ativo OU inativo: é o `medicamentoCadastroNome` do item ligado. Só leitura, só
 * `id, nome`. Id que não existe no Cadastro simplesmente não aparece no mapa. Sem ids, nem consulta.
 */
export async function nomesDosMedicamentosDoCadastro(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const nomes = new Map<string, string>();
  const unicos = [...new Set(ids.filter((i) => i !== ""))];
  for (let de = 0; de < unicos.length; de += 100) {
    const { data, error } = await createSupabaseAdminClient().from(TABELA_CADASTRO.medicamentos).select("id, nome").in("id", unicos.slice(de, de + 100));
    if (error) throw erro("ler os nomes dos medicamentos do Cadastro", error);
    for (const m of (data ?? []) as Array<{ id: string; nome: string }>) nomes.set(m.id, m.nome);
  }
  return nomes;
}


// ── Validação do estado da compra contra os Cadastros e as constantes ───────────────────────────────────────────

export const MENSAGEM_CONSULTOR_INVALIDO = "Consultor inválido: escolha um consultor ativo do Cadastro.";
export const MENSAGEM_DESPACHANTE_INVALIDO = "Despachante inválido: escolha um despachante ativo do Cadastro.";
export const MENSAGEM_FORNECEDOR_INVALIDO = "Fornecedor inválido: escolha um fornecedor ativo do Cadastro.";
export const MENSAGEM_ENVIO_INVALIDO = `Envio inválido: escolha ${MODAIS_ENVIO.join(", ")}.`;
export const MENSAGEM_CIA_INVALIDA = "Cia aérea inválida: escolha uma cia que vale para o envio (e escolha o envio primeiro).";
export const MENSAGEM_EMPRESA_INVALIDA = `Empresa inválida: escolha ${EMPRESAS_PROCESSO.join(" ou ")}.`;
const mensagemBrandInvalido = (n: number): string => `Medicamento ${n}: brand inválido: escolha ${BRANDS_MEDICAMENTO.join(" ou ")}.`;

/** Lê cada lista do Cadastro no máximo UMA vez por validação (e só se algum campo a pedir). */
function umaVez<T>(ler: () => Promise<T>): () => Promise<T> {
  let promessa: Promise<T> | null = null;
  return () => (promessa ??= ler());
}

/**
 * Consultor, despachante e fornecedor (quando PREENCHIDOS) precisam ser itens ATIVOS do Cadastro, comparados pela chave (sem acento, caixa
 * nem espaços repetidos) — e o valor gravado passa a ser o NOME do Cadastro. O envio precisa ser um dos modais fixos (MODAIS_ENVIO); a cia
 * aérea, uma das cias do modal (ciaAereaValidaParaModal: vem da constante do Follow-Up, NÃO do Cadastro de cias aéreas); a empresa, uma de
 * EMPRESAS_PROCESSO; o brand de cada medicamento, "" ou um valor de BRANDS_MEDICAMENTO. Medicamento e temperatura NÃO são validados
 * aqui (podem ser do pré-cadastro ou uma temperatura nova; o medicamento do Cadastro ou do pré-cadastro que não existe é 422 do banco).
 *
 * Tolerância a dado antigo (como no consultor do Follow-Up): o valor IGUAL ao que a compra já tem é aceito (consultor, despachante,
 * fornecedor, envio, empresa), mesmo que o item tenha sido desativado depois — senão a compra ficaria impossível de salvar. Só um valor NOVO precisa valer. A cia é conferida com o envio que
 * vai ficar (o do corpo, ou o atual): enquanto o par envio+cia for o que a compra já tinha, passa.
 * 422 com a mensagem do campo. Devolve o estado com os nomes do Cadastro; não altera o recebido.
 */
export async function validarEstadoContraCadastros(estado: CompraEstado, atual: Compra): Promise<CompraEstado> {
  const consultores = umaVez(() => listarConsultoresAtivos());
  const despachantes = umaVez(() => nomesDeDespachantesAtivos());
  const fornecedores = umaVez(() => nomesDeFornecedoresAtivos());

  async function resolver(valor: string, valorAtual: string, lista: () => Promise<string[]>, mensagem: string): Promise<string> {
    if (valor === "" || valor === valorAtual) return valor;
    const achado = (await lista()).find((nome) => chaveCadastro(nome) === chaveCadastro(valor));
    if (achado === undefined) throw new ComprasRegraError(mensagem, 422);
    return achado;
  }

  const campos = { ...estado.campos };
  if (campos.consultor !== undefined) campos.consultor = await resolver(campos.consultor, atual.consultor, consultores, MENSAGEM_CONSULTOR_INVALIDO);
  if (campos.despachante !== undefined) campos.despachante = await resolver(campos.despachante, atual.despachante, despachantes, MENSAGEM_DESPACHANTE_INVALIDO);
  if (campos.fornecedor !== undefined) campos.fornecedor = await resolver(campos.fornecedor, atual.fornecedor, fornecedores, MENSAGEM_FORNECEDOR_INVALIDO);
  if (campos.envio !== undefined) campos.envio = await resolver(campos.envio, atual.envio, async () => [...MODAIS_ENVIO], MENSAGEM_ENVIO_INVALIDO);

  if (campos.empresa !== undefined && campos.empresa !== atual.empresa && !(EMPRESAS_PROCESSO as readonly string[]).includes(campos.empresa)) {
    throw new ComprasRegraError(MENSAGEM_EMPRESA_INVALIDA, 422);
  }

  // A cia vale para o envio que vai ficar na compra.
  if (campos.cia !== undefined || campos.envio !== undefined) {
    const envio = campos.envio ?? atual.envio;
    const cia = campos.cia ?? atual.cia;
    const mudou = envio !== atual.envio || cia !== atual.cia;
    if (mudou && cia.trim() !== "") {
      // Comparada pela chave (sem acento nem caixa) com as cias DO MODAL (CIAS_AEREAS_POR_MODAL); o valor gravado é o nome da constante.
      const daConstante = ciasAereasDoModal(envio).find((c) => chaveCadastro(c) === chaveCadastro(cia));
      if (daConstante === undefined) throw new ComprasRegraError(MENSAGEM_CIA_INVALIDA, 422);
      campos.cia = daConstante;
    }
  }

  let itens: ItemCompraEstado[] | undefined;
  if (estado.itens) {
    // O brand antigo que não vale nunca chega aqui: a leitura (montarItem) já o devolve como "" (o banco não tem check).
    itens = estado.itens.map((item, i) => {
      if (item.brand !== "" && !(BRANDS_MEDICAMENTO as readonly string[]).includes(item.brand)) throw new ComprasRegraError(mensagemBrandInvalido(i + 1), 422);
      return item;
    });
  }

  return { ...estado, campos, ...(itens ? { itens } : {}) };
}
