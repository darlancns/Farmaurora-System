import { BLOCOS_DA_COMPRA, TEXTOS_RESUMO as T, type BlocoDaCompra } from "../constants/compraResumo";
import { MOEDA_SIMBOLO } from "../constants/pagamentos";
import type { Compra, DespachanteCadastroResumo } from "../types/compra";
import type {
  AvisosResumo,
  CompraResumoEntrada,
  DespachanteResumo,
  MedicamentoResumo,
  ValorOpcionalResumo,
} from "../types/compraResumo";
import { chaveCadastro } from "./cadastroNome";
import { formatarValorMonetario } from "./formatarMoeda";

// "Resumo da compra": o texto que o operacional copia e cola no WhatsApp. Função PURA: recebe um objeto e devolve texto — sem Date,
// sem rede, sem I/O, sem mexer na entrada — então não depende de fuso. As frases fixas estão em TEXTOS_RESUMO e a ordem dos blocos
// em BLOCOS_DA_COMPRA (shared/constants/compraResumo.ts).
//
// Formato: blocos separados por UMA linha em branco; dentro do bloco, uma linha por item. Campo sem valor é OMITIDO (a exceção é o
// "pendente ⏳" do local de aplicação e da entrega). Bloco sem nenhuma linha some junto com a linha em branco que o separaria.
// Campos "por medicamento" e "por ordem" saem unidos por " | " na ordem em que aparecem, com "-" no lugar de quem está vazio.

// ── Auxiliares (exportadas para teste) ────────────────────────────────────────────────────────────────────────

/**
 * Texto de uma linha: aparado e com qualquer sequência de espaços ou quebras de linha virando UM espaço (uma linha por item).
 * Valor que não é texto (undefined, null) é "".
 */
export function limparTextoResumo(valor: string | null | undefined): string {
  return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
}

/** Mês por extenso com inicial maiúscula ("Novembro"); "" quando não é um inteiro de 1 a 12. */
export function nomeDoMes(mes: number): string {
  return Number.isInteger(mes) && mes >= 1 && mes <= 12 ? (T.meses[mes - 1] ?? "") : "";
}

/** "US$ 1.234,56" (símbolo do dólar + o formatador de dinheiro do app); "" quando o valor é vazio (null, undefined ou NaN). */
export function formatarValorResumo(valor: ValorOpcionalResumo): string {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "";
  return `${MOEDA_SIMBOLO.USD} ${formatarValorMonetario(valor)}`;
}

/**
 * Valores na ordem dos itens (medicamentos ou ordens), unidos por " | ", com "-" no lugar de quem está vazio. "" quando TODOS estão
 * vazios (a linha inteira não sai). Com um item só, é o próprio valor.
 */
export function juntarPorOrdem(valores: readonly (string | null | undefined)[]): string {
  const limpos = valores.map(limparTextoResumo);
  if (limpos.every((v) => v === "")) return "";
  return limpos.map((v) => (v === "" ? T.valorVazio : v)).join(T.separadorValores);
}

// Palavras de ligação que ficam em minúsculas num nome (menos quando abrem o nome).
const LIGACOES_DO_NOME = new Set(["de", "da", "do", "das", "dos", "e"]);

const capitalizar = (palavra: string): string => (palavra === "" ? palavra : palavra.charAt(0).toUpperCase() + palavra.slice(1));

/**
 * Title Case SIMPLES de um nome de pessoa: cada palavra com a inicial maiúscula e o resto minúsculo (acentos preservados);
 * "de, da, do, das, dos, e" em minúsculas, salvo na primeira palavra; depois de hífen também é inicial ("Ana-Clara"). Siglas NÃO são
 * tratadas: "SILVA JR" vira "Silva Jr" e "II" vira "Ii".
 */
export function nomeEmTitleCase(nome: string): string {
  return limparTextoResumo(nome)
    .split(" ")
    .filter((p) => p !== "")
    .map((palavra, i) => {
      const minuscula = palavra.toLowerCase();
      if (i > 0 && LIGACOES_DO_NOME.has(minuscula)) return minuscula;
      return minuscula.split("-").map(capitalizar).join("-");
    })
    .join(" ");
}

// ── Linhas ────────────────────────────────────────────────────────────────────────────────────────────────────

/** `Rótulo: valor`, ou nenhuma linha quando o valor é vazio. */
const linha = (rotulo: string, valor: string): string[] => (valor === "" ? [] : [`${rotulo}: ${valor}`]);

type Montador = (entrada: CompraResumoEntrada) => string[];

function linhasDoTitulo(e: CompraResumoEntrada): string[] {
  const numero = Number.isInteger(e.numero) && e.numero >= 1 ? String(e.numero).padStart(2, "0") : "";
  const ano = Number.isInteger(e.ano) && e.ano > 0 ? String(e.ano).padStart(4, "0") : "";
  const periodo = [nomeDoMes(e.mes), ano].filter((p) => p !== "").join("/");
  const compra = [T.compra, numero].filter((p) => p !== "").join(" ");
  return [`*${periodo === "" ? compra : `${compra} - ${periodo}`}*`];
}

/**
 * Temperatura: uma linha só quando todos os medicamentos que têm temperatura têm a MESMA (sem acento nem caixa); senão uma linha por
 * temperatura distinta, na ordem da primeira aparição, com os NOMES dos medicamentos dela ("Temperatura A, B: 2°C a 8°C").
 * Medicamento sem temperatura não entra na conta.
 */
export function linhasDeTemperatura(medicamentos: readonly MedicamentoResumo[]): string[] {
  const grupos = new Map<string, { texto: string; nomes: string[] }>();
  for (const m of medicamentos) {
    const texto = limparTextoResumo(m.temperatura);
    if (texto === "") continue;
    const chave = chaveCadastro(texto);
    const grupo = grupos.get(chave) ?? { texto, nomes: [] };
    const nome = limparTextoResumo(m.nome);
    if (nome !== "") grupo.nomes.push(nome);
    grupos.set(chave, grupo);
  }

  const lista = [...grupos.values()];
  if (lista.length === 0) return [];
  const primeiro = lista[0]!;
  if (lista.length === 1) return [`${T.temperatura}: ${primeiro.texto}`];
  return lista.map((g) => (g.nomes.length > 0 ? `${T.temperatura} ${g.nomes.join(", ")}: ${g.texto}` : `${T.temperatura}: ${g.texto}`));
}

function linhasDeMedicamentosEOrdens(e: CompraResumoEntrada): string[] {
  const ordens = e.ordens;
  const medicamentos = ordens.flatMap((o) => o.medicamentos);
  const linhas: string[] = [];

  // "Medicamento: nome apresentação"; com mais de um no total (somando as ordens), "Medicamento 1:", "Medicamento 2:"...
  medicamentos.forEach((m, i) => {
    const texto = [limparTextoResumo(m.nome), limparTextoResumo(m.apresentacao)].filter((p) => p !== "").join(" ");
    if (texto === "") return;
    linhas.push(`${medicamentos.length > 1 ? `${T.medicamento} ${i + 1}` : T.medicamento}: ${texto}`);
  });

  // Por medicamento.
  linhas.push(...linha(T.referencia, juntarPorOrdem(medicamentos.map((m) => m.referencia))));
  linhas.push(...linha(T.laboratorio, juntarPorOrdem(medicamentos.map((m) => m.laboratorio))));
  linhas.push(...linha(T.quantidade, juntarPorOrdem(medicamentos.map((m) => m.quantidade))));
  linhas.push(...linha(T.valorUnitario, juntarPorOrdem(medicamentos.map((m) => formatarValorResumo(m.valorUnitario)))));
  linhas.push(...linha(T.valorReal, juntarPorOrdem(medicamentos.map((m) => formatarValorResumo(m.valorReal)))));

  // Ordens: "fornecedores distintos" só com mais de uma ordem e mais de um fornecedor diferente (sem acento, caixa nem espaços repetidos).
  if (ordens.length > 0) {
    const fornecedores = new Set(ordens.map((o) => chaveCadastro(limparTextoResumo(o.fornecedor))).filter((chave) => chave !== ""));
    const distintos = ordens.length > 1 && fornecedores.size > 1;
    linhas.push(`${T.ordens}: ${ordens.length}${distintos ? ` - ${T.fornecedoresDistintos}` : ""}`);
  }

  // Por ordem.
  linhas.push(...linha(T.frete, juntarPorOrdem(ordens.map((o) => formatarValorResumo(o.frete)))));
  linhas.push(...linha(T.valorRealFrete, juntarPorOrdem(ordens.map((o) => formatarValorResumo(o.freteReal)))));
  linhas.push(...linha(T.envio, juntarPorOrdem(ordens.map((o) => o.envio))));
  linhas.push(...linha(T.fornecedor, juntarPorOrdem(ordens.map((o) => o.fornecedor))));

  linhas.push(`${T.cnpj}: ${T.cnpjValor}`);
  linhas.push(...linhasDeTemperatura(medicamentos));
  return linhas;
}

function linhasDoPagamento(e: CompraResumoEntrada): string[] {
  const partes: string[] = [];
  if (e.pagamento.alvara === true) partes.push(T.alvaraNaConta);
  if (e.pagamento.momento === "vamos_pagar") partes.push(T.vamosPagar);
  else if (e.pagamento.momento === "apos_awb") partes.push(T.aposAwb);

  // A linha do termo SEMPRE sai: "Sim" (com a observação, se houver) ou "n/a".
  const observacao = limparTextoResumo(e.termoPosterior.observacao);
  const termo = e.termoPosterior.sim ? `${T.termoSim}${observacao === "" ? "" : ` - ${observacao}`}` : T.termoNaoAplica;

  return [...linha(T.pagamento, partes.join(", ")), `${T.termoPosterior}: ${termo}`];
}

function linhasDoPaciente(e: CompraResumoEntrada): string[] {
  const nome = nomeEmTitleCase(e.paciente);
  return nome === "" ? [] : [`${T.paciente}: *${nome}*`];
}

function linhasDoDespachante(despachante: DespachanteResumo | null): string[] {
  if (despachante === null) return [];
  if (despachante.courierSimples) return [`${T.despachante}: ${T.despachanteNaoAplica}`];

  // "Broker" e os contatos ficam logo abaixo, no mesmo bloco, e só com as linhas que existirem.
  const contatos = [
    ...linha(T.brokerTelefone, limparTextoResumo(despachante.telefone)),
    ...linha(T.brokerEmail, limparTextoResumo(despachante.email)),
    ...linha(T.brokerContato, limparTextoResumo(despachante.contato)),
  ];
  return [...linha(T.despachante, limparTextoResumo(despachante.nome)), ...(contatos.length > 0 ? [T.broker, ...contatos] : [])];
}

function linhasDosAvisos(avisos: AvisosResumo): string[] {
  const linhas: string[] = [];
  if (avisos.isencao) {
    const para = limparTextoResumo(avisos.isencaoPara);
    linhas.push(para === "" ? T.isencao : `${T.isencao} ${T.isencaoPara} ${para}`);
  }
  if (avisos.documentos === true) linhas.push(T.documentosOk);
  if (avisos.documentos === false) linhas.push(T.documentosNaoOk);
  const pendencias = avisos.pendencias.map(limparTextoResumo).filter((p) => p !== "");
  linhas.push(...linha(T.pendencias, pendencias.join(", ")));
  linhas.push(...linha(T.observacoes, limparTextoResumo(avisos.observacoes)));
  return linhas;
}

function linhasDoProcesso(e: CompraResumoEntrada): string[] {
  if (e.processo.particular) return [`${T.numeroProcesso}: ${T.compraParticular}`];
  return linha(T.numeroProcesso, limparTextoResumo(e.processo.numero));
}

// Local de aplicação e entrega: as DUAS linhas sempre saem; o que estiver vazio vira "pendente ⏳".
function linhasDoLocalEEntrega(e: CompraResumoEntrada): string[] {
  const rotuloLocal = e.localDeclarado ? T.localAplicacaoDeclarado : T.localAplicacao;
  return [
    `${rotuloLocal}: ${limparTextoResumo(e.localAplicacao) || T.pendenteMarca}`,
    `${T.entrega}: ${limparTextoResumo(e.entrega) || T.pendenteMarca}`,
  ];
}

// Um montador por bloco. O tipo Record faz o compilador exigir TODOS os ids de BlocoDaCompra (e recusar um id que não existe).
const MONTADORES: Record<BlocoDaCompra, Montador> = {
  titulo: linhasDoTitulo,
  medicamentos_e_ordens: linhasDeMedicamentosEOrdens,
  pagamento: linhasDoPagamento,
  paciente: linhasDoPaciente,
  despachante: (e) => linhasDoDespachante(e.despachante),
  avisos: (e) => linhasDosAvisos(e.avisos),
  vendedor_responsavel: (e) => [...linha(T.vendedor, limparTextoResumo(e.vendedor)), ...linha(T.responsavel, limparTextoResumo(e.responsavel))],
  processo: linhasDoProcesso,
  medico: (e) => linha(T.medico, limparTextoResumo(e.medico)),
  local_entrega: linhasDoLocalEEntrega,
  contatos: (e) => linha(T.contatos, limparTextoResumo(e.contatos)),
};

/**
 * O texto do resumo: os blocos de BLOCOS_DA_COMPRA, na ordem, separados por UMA linha em branco; bloco sem linha some. Sem quebra de
 * linha no fim. Não altera a entrada.
 */
export function montarResumoCompra(entrada: CompraResumoEntrada): string {
  return BLOCOS_DA_COMPRA.map((id) => MONTADORES[id](entrada))
    .filter((linhas) => linhas.length > 0)
    .map((linhas) => linhas.join("\n"))
    .join("\n\n");
}

// ── Da Compra para a entrada do resumo ──────────────────────────────────────────────────────────────────────

/** "2026-11" → { ano: 2026, mes: 11 }; fora do formato, 0 e 0 (o título do resumo some com a parte inválida). */
function anoEMesDe(anoMes: string): { ano: number; mes: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(anoMes);
  return m ? { ano: Number(m[1]), mes: Number(m[2]) } : { ano: 0, mes: 0 };
}

/**
 * Converte o estado de uma Compra (o que o servidor guarda) na entrada de `montarResumoCompra`. O despachante vem do Cadastro de
 * despachantes (telefone, e-mail e contato): só entra se for o MESMO da compra (pela chave: sem acento nem caixa) e SÓ esses campos
 * são copiados — a chave PIX nunca passa por aqui (o tipo `DespachanteCadastroResumo` nem tem o campo, e a cópia é campo a campo,
 * então um objeto com a mais é ignorado). Courier Simples: "Despachante: N/A". Sem despachante escolhido: o bloco some.
 */
export function compraParaResumoEntrada(compra: Compra, despachanteCadastro: DespachanteCadastroResumo | null = null): CompraResumoEntrada {
  const { ano, mes } = anoEMesDe(compra.anoMes);

  let despachante: DespachanteResumo | null = null;
  if (compra.courierSimples) {
    despachante = { courierSimples: true };
  } else if (limparTextoResumo(compra.despachante) !== "") {
    const mesmo = despachanteCadastro !== null && chaveCadastro(limparTextoResumo(despachanteCadastro.nome)) === chaveCadastro(limparTextoResumo(compra.despachante));
    despachante = {
      courierSimples: false,
      nome: compra.despachante,
      ...(mesmo
        ? { telefone: despachanteCadastro.telefone, email: despachanteCadastro.email, contato: despachanteCadastro.contatoNome }
        : {}),
    };
  }

  return {
    numero: compra.sequencia,
    mes,
    ano,
    ordens: compra.ordens.map((o) => ({
      fornecedor: o.fornecedor,
      envio: o.envio,
      frete: o.frete,
      freteReal: o.freteReal,
      medicamentos: o.itens.map((i) => ({
        nome: i.medicamento,
        apresentacao: i.apresentacao,
        referencia: i.referencia,
        laboratorio: i.laboratorio,
        quantidade: i.quantidade,
        valorUnitario: i.valorUnitario,
        valorReal: i.valorReal,
        temperatura: i.temperatura,
      })),
    })),
    pagamento: { alvara: compra.pagamentoAlvara, momento: compra.pagamentoMomento },
    termoPosterior: { sim: compra.termoPosterior, observacao: compra.termoObservacao },
    paciente: compra.paciente,
    despachante,
    avisos: {
      isencao: compra.isencao,
      isencaoPara: compra.isencaoPara,
      documentos: compra.documentos,
      pendencias: [...compra.pendencias],
      observacoes: compra.observacoes,
    },
    vendedor: compra.vendedor,
    responsavel: compra.responsavel,
    processo: { particular: compra.compraParticular, numero: compra.processoNumero },
    medico: compra.medico,
    localAplicacao: compra.localAplicacao,
    localDeclarado: compra.localDeclarado,
    entrega: compra.entrega,
    contatos: compra.contatos,
  };
}
