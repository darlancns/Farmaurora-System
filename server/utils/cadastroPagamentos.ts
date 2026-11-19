import { createError } from "h3";
import type { CadastrosPagamento, ItemCadastroPagamento, TipoGrupoPagamento } from "../../shared/types/Pagamento";
import type { ListaCadastro } from "../../shared/types/Cadastro";
import { acharItemPorNome, rotuloFornecedorPagamento } from "../../shared/utils/pagamentoCadastro";
import { chaveCadastro } from "../../shared/utils/cadastroNome";
import { listarCadastro } from "./cadastrosStore";

/**
 * Como Pagamentos LÊ os Cadastros (Configurações → Cadastros): fornecedores, despachantes e transportadoras, mais a chave
 * PIX dos despachantes e das transportadoras. Pagamentos não escreve nada aqui (a chave PIX só se altera em Cadastros, pelo
 * administrador).
 *
 * É o ÚNICO caminho de Pagamentos até as tabelas de Cadastros (a guarda tests/unit/cadastrosPixNenhumaOutraRota.spec.ts
 * confere): passa pelo store dos Cadastros, que só lê `chave_pix` quando se pede (`incluirPix`) e nunca repassa a mensagem
 * do banco nas listas com PIX.
 *
 * CHAVE PIX = dado financeiro. Aqui ela só sai nos retornos de `pixDoCadastro` e `resolverDestinoGrupo` (quem chama já
 * decidiu a visibilidade) e NUNCA vai para log nem para mensagem de erro: os logs desta camada citam só o tipo e os NOMES.
 */

const LISTA_DO_TIPO: Record<TipoGrupoPagamento, Extract<ListaCadastro, "despachantes" | "transportadoras">> = {
  DESPACHANTE: "despachantes",
  TRANSPORTADORA: "transportadoras",
};

const ROTULO_DO_TIPO: Record<TipoGrupoPagamento, string> = {
  DESPACHANTE: "Despachante",
  TRANSPORTADORA: "Transportadora",
};

function avisarSemChave(tipo: TipoGrupoPagamento, nomes: readonly string[]): void {
  if (nomes.length === 0) return;
  // Só tipo e nomes. Nunca a chave.
  console.warn(`[pagamentos] sem chave PIX no Cadastro (${LISTA_DO_TIPO[tipo]}): ${nomes.join(", ")}`);
}

/** Fornecedores, despachantes e transportadoras do Cadastro (ativos e inativos, com `ativo`), SEM chave PIX. */
export async function obterCadastrosDePagamentos(): Promise<CadastrosPagamento> {
  const [fornecedores, despachantes, transportadoras] = await Promise.all([
    listarCadastro("fornecedores"),
    listarCadastro("despachantes"),
    listarCadastro("transportadoras"),
  ]);
  const item = (i: { nome: string; ativo: boolean }, pais = ""): ItemCadastroPagamento => ({
    nome: i.nome,
    ativo: i.ativo,
    pais,
  });
  return {
    fornecedores: fornecedores.map((f) => item(f, f.pais)),
    despachantes: despachantes.map((d) => item(d)),
    transportadoras: transportadoras.map((t) => item(t)),
  };
}

/**
 * Chave PIX por nome (os ATIVOS do tipo que têm chave cadastrada), no formato que a tela já usava: { nome: chave }. O nome é
 * o do Cadastro; quem consulta casa por chaveCadastro. Nome ativo sem chave fica de fora e vai para o log (sem a chave).
 */
export async function pixDoCadastro(tipo: TipoGrupoPagamento): Promise<Record<string, string>> {
  const itens = await listarCadastro(LISTA_DO_TIPO[tipo], { incluirPix: true });
  const mapa: Record<string, string> = {};
  const semChave: string[] = [];
  for (const item of itens) {
    if (!item.ativo) continue;
    const chave = (item.chavePix ?? "").trim();
    if (chave === "") semChave.push(item.nome);
    else mapa[item.nome] = chave;
  }
  avisarSemChave(tipo, semChave);
  return mapa;
}

/**
 * Valida o destino de um grupo NOVO: o nome tem de existir e estar ATIVO no Cadastro do tipo (casado por chaveCadastro).
 * Devolve o nome COMO ESTÁ no Cadastro e a cópia da chave PIX (instantâneo histórico, gravado no grupo); sem chave no
 * Cadastro, `chavePix` fica ausente (o PIX do grupo é opcional) e o fato vai para o log, sem a chave.
 */
export async function resolverDestinoGrupo(
  tipo: TipoGrupoPagamento,
  nomeGrupo: string,
): Promise<{ nomeGrupo: string; chavePix?: string }> {
  const itens = await listarCadastro(LISTA_DO_TIPO[tipo], { incluirPix: true });
  const item = acharItemPorNome(
    itens.filter((i) => i.ativo),
    nomeGrupo,
  );
  if (!item) {
    throw createError({
      statusCode: 400,
      statusMessage: `${ROTULO_DO_TIPO[tipo]} não encontrado ou inativo no Cadastro.`,
    });
  }
  const chave = (item.chavePix ?? "").trim();
  if (chave === "") {
    avisarSemChave(tipo, [item.nome]);
    return { nomeGrupo: item.nome };
  }
  return { nomeGrupo: item.nome, chavePix: chave };
}

/**
 * Valida o fornecedor de um lançamento NOVO do Banco. Com `outro` (a opção "Outro" da tela) o texto é livre. Sem ele, tem de
 * ser o "Nome - País" de um fornecedor ATIVO do Cadastro (casado por chaveCadastro); devolve o texto como está no Cadastro.
 */
export async function resolverFornecedorNovo(fornecedor: string, outro: boolean): Promise<string> {
  const texto = fornecedor.trim();
  if (outro) return texto;
  const ativos = (await obterCadastrosDePagamentos()).fornecedores.filter((f) => f.ativo);
  const achado = ativos.find((f) => chaveCadastro(rotuloFornecedorPagamento(f)) === chaveCadastro(texto));
  if (!achado) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Fornecedor não encontrado ou inativo no Cadastro. Use a opção "Outro" para um texto livre.',
    });
  }
  return rotuloFornecedorPagamento(achado);
}
