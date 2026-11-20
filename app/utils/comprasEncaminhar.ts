import type { Compra, LinhaDaPrevia, PreviaEncaminhar } from "#shared/types/compra";
import { checklistCompra } from "#shared/utils/compraChecklist";
import { normalizarNumeroPo } from "#shared/utils/numeroPo";
import type { ItemComCampo } from "../components/compras/CompraChecklistPainel.vue";
import { campoDoItem } from "./comprasCampos";

// Funções PURAS do painel "Encaminhar para a DIR" (a lógica de tela fica em useEncaminharCompra; o desenho, em CompraEncaminharPainel.vue).
// Os textos dos erros do servidor (códigos de GET encaminhar-previa e POST encaminhar) e da conferência ficam aqui, num lugar só.

export const MENSAGEM_VENDEDOR_INATIVO = "Escolha um consultor ativo para o vendedor desta compra";
export const MENSAGEM_FALHA_ENCAMINHAR = "Não foi possível encaminhar. Nada foi criado ou pode ter sido criado parcialmente: tente de novo (repetir é seguro).";
export const MENSAGEM_JA_ENCAMINHADA = "Esta compra já estava encaminhada.";
export const MENSAGEM_NAO_SALVOU_ENCAMINHAR = "Não foi possível salvar as alterações desta compra. Salve de novo antes de encaminhar.";

/** "1 linha" / "3 linhas". */
export const rotuloLinhas = (n: number): string => `${n} ${n === 1 ? "linha" : "linhas"}`;

/** O texto do cabeçalho do painel: quantas linhas serão criadas. */
export const textoSerao = (n: number): string =>
  `${n === 1 ? "Será criada 1 linha" : `Serão criadas ${n} linhas`}, uma por ordem. O formulário ao lado continua editável.`;

/** "Encaminhar 1 linha" / "Encaminhar 3 linhas". */
export const rotuloBotaoEncaminhar = (n: number): string => `Encaminhar ${rotuloLinhas(n)}`;

/** "Encaminhada: 1 linha criada na DIR" / "Encaminhada: 3 linhas criadas na DIR". */
export const textoCriadas = (n: number): string => `Encaminhada: ${n} ${n === 1 ? "linha criada" : "linhas criadas"} na DIR`;

/** A chave da confirmação da temperatura de uma linha: muda quando a temperatura muda (então pede a confirmação de novo). */
export const chaveConfirmacao = (linha: Pick<LinhaDaPrevia, "ordemId" | "dir">): string => `${linha.ordemId}|${linha.dir.temperatura}`;

/** As linhas que ainda serão criadas (ordens sem dir_id). */
export const linhasPendentesDaPrevia = (previa: PreviaEncaminhar | null): LinhaDaPrevia[] => (previa ? previa.linhas.filter((l) => !l.jaEncaminhada) : []);

/** As linhas pendentes com temperatura mista: cada uma exige a caixa de confirmação. */
export const linhasMistasDaPrevia = (previa: PreviaEncaminhar | null): LinhaDaPrevia[] => linhasPendentesDaPrevia(previa).filter((l) => l.temperaturaMista);

/** A prévia impede o Encaminhar? (erros da checagem, PO na DIR, PO repetido na compra, vendedor inativo). */
export function previaTemImpedimento(previa: PreviaEncaminhar | null): boolean {
  if (!previa) return false;
  return previa.erros.length > 0 || previa.conflitosPo.length > 0 || previa.posRepetidosNaCompra.length > 0 || previa.vendedorInativo;
}

const ordensComPo = (compra: Pick<Compra, "ordens">, po: string): number[] =>
  compra.ordens.filter((o) => (o.dirId ?? "").trim() === "" && normalizarNumeroPo(o.po) === po).map((o) => o.posicao);

/**
 * Os itens da conferência do painel, no formato do checklist (CompraChecklistPainel): os ERROS vêm da prévia (os da checagem, PO que já existe
 * na DIR, PO repetido na compra, vendedor inativo, linha que não cabe na DIR); os AVISOS e os itens OK vêm da checagem local da compra (a prévia
 * só traz o que impede). Cada erro com campo é clicável (o painel continua aberto). Erro de PO leva ao campo PO da ordem.
 */
export function itensDaConferencia(previa: PreviaEncaminhar | null, compra: Compra): ItemComCampo[] {
  const local = checklistCompra(compra).itens;
  const itens: ItemComCampo[] = [];

  for (const e of previa?.erros ?? []) {
    const linhaDir = /^ordem-(\d+)-linha-dir$/.exec(e.id);
    itens.push({ ...e, campo: linhaDir ? `ordem-${linhaDir[1]}-medicamentos` : campoDoItem(e.id, compra) });
  }
  for (const po of previa?.conflitosPo ?? []) {
    const posicoes = ordensComPo(compra, po);
    itens.push({ id: `po-na-dir-${po}`, nivel: "erro", texto: `${po} já existe na DIR`, campo: posicoes[0] === undefined ? null : `ordem-${posicoes[0]}-po`, ...(posicoes[0] === undefined ? {} : { ordemPosicao: posicoes[0] }) });
  }
  for (const po of previa?.posRepetidosNaCompra ?? []) {
    const posicoes = ordensComPo(compra, po);
    itens.push({ id: `po-repetido-${po}`, nivel: "erro", texto: `PO repetido na compra: ${po}`, campo: posicoes[0] === undefined ? null : `ordem-${posicoes[0]}-po` });
  }
  if (previa?.vendedorInativo) itens.push({ id: "vendedor-inativo", nivel: "erro", texto: MENSAGEM_VENDEDOR_INATIVO, campo: "vendedor" });

  for (const i of local) {
    if (i.nivel === "aviso") itens.push({ ...i, campo: campoDoItem(i.id, compra) });
    else if (i.nivel === "ok") itens.push({ ...i, campo: null });
  }
  return itens;
}

/** As permissões que o Encaminhar exige: escrever em Compras E na DIR (as mesmas funções do app: canWrite). */
export interface PermissoesEncaminhar {
  compras: boolean;
  dir: boolean;
}

export const RAZAO_SEM_PERMISSAO_COMPRAS = "Sem permissão para editar Compras";
export const RAZAO_SEM_PERMISSAO_DIR = "Sem permissão para escrever na DIR";
export const RAZAO_COMPRA_CANCELADA = "Compra cancelada";
export const RAZAO_SEM_ORDENS = "Adicione uma ordem para encaminhar";
export const RAZAO_TODAS_ENCAMINHADAS = "Todas as ordens já foram encaminhadas";
export const TEXTO_ENCAMINHAR_DISPONIVEL = "Cria uma linha na DIR para cada ordem.";

/** Por que o botão "Encaminhar para a DIR" está desabilitado (texto ao lado do botão), ou null quando pode abrir o painel. */
export function razaoEncaminharDesabilitado(compra: Pick<Compra, "cancelada" | "ordens">, permissoes: PermissoesEncaminhar): string | null {
  if (!permissoes.compras) return RAZAO_SEM_PERMISSAO_COMPRAS;
  if (!permissoes.dir) return RAZAO_SEM_PERMISSAO_DIR;
  if (compra.cancelada) return RAZAO_COMPRA_CANCELADA;
  if (compra.ordens.length === 0) return RAZAO_SEM_ORDENS;
  if (compra.ordens.every((o) => (o.dirId ?? "").trim() !== "")) return RAZAO_TODAS_ENCAMINHADAS;
  return null;
}

/**
 * Os `data.code` do 409 do salvamento quando o servidor TRAVA a ordem já encaminhada para a DIR (remover a ordem ou trocar o PO). Repetir o mesmo
 * estado levaria o mesmo 409: a tela só oferece "Carregar a versão salva" (nunca "Manter as minhas e salvar por cima").
 */
export const CODIGOS_CONFLITO_DE_TRAVA: readonly string[] = ["ordem_encaminhada_removida", "po_travado"];

export const conflitoEhDeTrava = (codigo: string | null | undefined): boolean => codigo !== null && codigo !== undefined && CODIGOS_CONFLITO_DE_TRAVA.includes(codigo);

export const TEXTO_CONFLITO_PADRAO = "Esta compra foi alterada por outra pessoa.";
export const TEXTO_PO_ENCAMINHADO = "PO já encaminhado: altere na DIR";
export const TEXTO_REMOVER_ENCAMINHADA = "Já encaminhada para a DIR";
export const AVISO_CANCELAR_COM_ENCAMINHADAS = "Há ordens já encaminhadas para a DIR. As linhas da DIR continuam existindo e não são alteradas.";
