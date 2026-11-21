import { BLOCOS_DA_COMPRA, TEXTOS_RESUMO as T, type BlocoDaCompra } from "../constants/compraResumo";
import { MOEDA_SIMBOLO } from "../constants/pagamentos";
import { isBrandMedicamento, MODAL_COURIER_SIMPLES, ROTULOS_BRAND_MEDICAMENTO } from "../constants/processos";
import type { Compra, DespachanteCadastroResumo } from "../types/compra";
import type {
  BlocoDoResumo,
  CompraResumoEntrada,
  DespachanteResumo,
  LinhaDoResumo,
  MedicamentoResumo,
  ModoResumo,
  ValorOpcionalResumo,
} from "../types/compraResumo";
import { chaveCadastro } from "./cadastroNome";
import { formatarValorMonetario } from "./formatarMoeda";

// "Resumo da compra": o texto que o operacional copia e cola no WhatsApp. Função PURA: recebe um objeto e devolve dados/texto — sem
// Date, sem rede, sem I/O, sem mexer na entrada — então não depende de fuso. As frases fixas estão em TEXTOS_RESUMO e a ordem dos
// blocos em BLOCOS_DA_COMPRA (shared/constants/compraResumo.ts); a ordem das LINHAS dentro dos blocos é a do formulário (abaixo).
//
// Dois modos (montarResumo):
//  - "copia": o texto do WhatsApp. Campo sem valor é OMITIDO (exceções: "pendente ⏳" do local de aplicação e da entrega; "Ordens: N"
//    e "Termo de pagamento posterior" saem sempre). Bloco sem nenhuma linha some junto com a linha em branco que o separaria.
//  - "modelo": TODOS os rótulos, na ordem do formulário, com o valor cru e `vazio: true` onde não há valor (a tela mostra o modelo do
//    que será copiado). Toda linha COM valor do modelo é IDÊNTICA à da cópia.
// Formato do texto: blocos separados por UMA linha em branco; uma linha por item. Campos "por medicamento" saem unidos por " | " na
// ordem dos medicamentos, com "-" no lugar de quem está vazio.

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
 * Valores na ordem dos medicamentos, unidos por " | ", com "-" no lugar de quem está vazio. "" quando TODOS estão vazios (a linha
 * inteira não sai). Com um item só, é o próprio valor.
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
 * Title Case SIMPLES de um nome de pessoa (e da empresa: "FARMAURORA" → "Farmaurora"): cada palavra com a inicial maiúscula e o resto
 * minúsculo (acentos preservados); "de, da, do, das, dos, e" em minúsculas, salvo na primeira palavra; depois de hífen também é
 * inicial ("Ana-Clara"). Siglas NÃO são tratadas: "SILVA JR" vira "Silva Jr" e "II" vira "Ii".
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

/**
 * Temperatura: um grupo só quando todos os medicamentos que têm temperatura têm a MESMA (sem acento nem caixa); senão um grupo por
 * temperatura distinta, na ordem da primeira aparição, com os NOMES dos medicamentos dela ("Temperatura A, B": "2°C a 8°C").
 * Medicamento sem temperatura não entra na conta; sem nenhuma temperatura, nenhum grupo.
 */
export function gruposDeTemperatura(medicamentos: readonly MedicamentoResumo[]): { rotulo: string; valor: string }[] {
  const grupos = new Map<string, { texto: string; nomes: string[] }>();
  for (const m of medicamentos) {
    const texto = limparTextoResumo(m.temperatura);
    if (texto === "") continue;
    const chave = chaveCadastro(texto);
    const grupo = grupos.get(chave) ?? { texto, nomes: [] };
    const nome = limparTextoResumo(m.medicamento);
    if (nome !== "") grupo.nomes.push(nome);
    grupos.set(chave, grupo);
  }
  const lista = [...grupos.values()];
  if (lista.length === 1) return [{ rotulo: T.temperatura, valor: lista[0]!.texto }];
  return lista.map((g) => ({ rotulo: g.nomes.length > 0 ? `${T.temperatura} ${g.nomes.join(", ")}` : T.temperatura, valor: g.texto }));
}

/** O texto do Envio: "Air Cargo (Emirates)" com cia; só o modal sem cia; nada sem modal (a cia sozinha não sai). */
export function textoDoEnvio(envio: string, cia: string): string {
  const modal = limparTextoResumo(envio);
  if (modal === "") return "";
  const nomeCia = limparTextoResumo(cia);
  return nomeCia === "" ? modal : `${modal} ${T.ciaAbre}${nomeCia}${T.ciaFecha}`;
}

/** O rótulo do Brand como o Follow-Up mostra (Bioequivalente / Referência); "" quando não informado ou desconhecido. */
export function rotuloDoBrand(brand: string | null | undefined): string {
  return isBrandMedicamento(brand) ? ROTULOS_BRAND_MEDICAMENTO[brand] : "";
}

// ── Linhas ────────────────────────────────────────────────────────────────────────────────────────────────────

interface Contexto {
  readonly modo: ModoResumo;
}

const NA_COPIA: Contexto = { modo: "copia" };

/** `Rótulo: valor`. Valor vazio: no modelo a linha fica (vazio: true); na cópia ela não existe. */
function linha(c: Contexto, id: string, rotulo: string, valor: string, negrito = false): LinhaDoResumo[] {
  if (valor === "") return c.modo === "modelo" ? [{ id, rotulo, valor: "", vazio: true }] : [];
  return [{ id, rotulo, valor, vazio: false, ...(negrito ? { negrito: true } : {}) }];
}

/** Linha-marcador (só o rótulo, sem valor): "Recorrente", "Pedir isenção imposto ❗". Desligada: só no modelo, como vazia. */
function marcador(c: Contexto, id: string, rotulo: string, ligado: boolean): LinhaDoResumo[] {
  if (ligado) return [{ id, rotulo, valor: "", vazio: false }];
  return c.modo === "modelo" ? [{ id, rotulo, valor: "", vazio: true }] : [];
}

type Montador = (e: CompraResumoEntrada, c: Contexto) => LinhaDoResumo[];

function linhasDoTitulo(e: CompraResumoEntrada): LinhaDoResumo[] {
  const numero = Number.isInteger(e.numero) && e.numero >= 1 ? String(e.numero).padStart(2, "0") : "";
  const ano = Number.isInteger(e.ano) && e.ano > 0 ? String(e.ano).padStart(4, "0") : "";
  const periodo = [nomeDoMes(e.mes), ano].filter((p) => p !== "").join("/");
  const compra = [T.compra, numero].filter((p) => p !== "").join(" ");
  return [{ id: "titulo", rotulo: "", valor: periodo === "" ? compra : `${compra} - ${periodo}`, vazio: false, negrito: true }];
}

// A ordem do formulário: Medicamento, Laboratório, Brand, Quantidade, Ordens, Valor unitário, Valor real, Frete, Valor real do frete,
// Temperatura, Envio, Fornecedor, CNPJ.
function linhasDoBlocoMedicamentos(e: CompraResumoEntrada, c: Contexto): LinhaDoResumo[] {
  const medicamentos: readonly MedicamentoResumo[] = e.medicamentos.length > 0 ? e.medicamentos : [{ medicamento: "" }];
  const varios = medicamentos.length > 1;
  const linhas: LinhaDoResumo[] = [];

  // "Medicamento: texto"; com mais de um, "Medicamento 1:", "Medicamento 2:"... (uma linha por medicamento; vazio some na cópia).
  medicamentos.forEach((m, i) => {
    const id = varios ? `medicamento_${i + 1}` : "medicamento";
    linhas.push(...linha(c, id, varios ? `${T.medicamento} ${i + 1}` : T.medicamento, limparTextoResumo(m.medicamento)));
  });

  // Por medicamento (unidos por " | ").
  linhas.push(...linha(c, "laboratorio", T.laboratorio, juntarPorOrdem(medicamentos.map((m) => m.laboratorio))));
  linhas.push(...linha(c, "brand", T.brand, juntarPorOrdem(medicamentos.map((m) => rotuloDoBrand(m.brand)))));
  linhas.push(...linha(c, "quantidade", T.quantidade, juntarPorOrdem(medicamentos.map((m) => m.quantidade))));

  // Ordens: SEMPRE sai (é um número de 1 a N; vazio só se o número for inválido).
  const ordens = Number.isInteger(e.numeroOrdens) && e.numeroOrdens >= 1 ? String(e.numeroOrdens) : "";
  linhas.push(...linha(c, "ordens", T.ordens, ordens));

  linhas.push(...linha(c, "valor_unitario", T.valorUnitario, juntarPorOrdem(medicamentos.map((m) => formatarValorResumo(m.valorUnitario)))));
  linhas.push(...linha(c, "valor_real", T.valorReal, juntarPorOrdem(medicamentos.map((m) => formatarValorResumo(m.valorReal)))));
  linhas.push(...linha(c, "frete", T.frete, formatarValorResumo(e.frete)));
  linhas.push(...linha(c, "frete_real", T.valorRealFrete, formatarValorResumo(e.freteReal)));

  const temperaturas = gruposDeTemperatura(medicamentos);
  if (temperaturas.length === 0) linhas.push(...linha(c, "temperatura", T.temperatura, ""));
  temperaturas.forEach((g, i) => linhas.push(...linha(c, i === 0 ? "temperatura" : `temperatura_${i + 1}`, g.rotulo, g.valor)));

  linhas.push(...linha(c, "envio", T.envio, textoDoEnvio(e.envio, e.cia)));
  linhas.push(...linha(c, "fornecedor", T.fornecedor, limparTextoResumo(e.fornecedor)));
  linhas.push(...linha(c, "cnpj", T.cnpj, nomeEmTitleCase(e.empresa)));
  return linhas;
}

function linhasDoPagamento(e: CompraResumoEntrada, c: Contexto): LinhaDoResumo[] {
  const partes: string[] = [];
  if (e.pagamento.alvara === true) partes.push(T.alvaraNaConta);
  if (e.pagamento.momento === "vamos_pagar") partes.push(T.vamosPagar);
  else if (e.pagamento.momento === "apos_awb") partes.push(T.aposAwb);

  // O termo: na cópia a linha SEMPRE sai ("Sim", com a observação se houver, ou "n/a"); no modelo "n/a" não é inventado (fica vazio).
  const observacao = limparTextoResumo(e.termoPosterior.observacao);
  const naoAplica = c.modo === "copia" ? T.termoNaoAplica : "";
  const termo = e.termoPosterior.sim ? `${T.termoSim}${observacao === "" ? "" : ` - ${observacao}`}` : naoAplica;

  return [...linha(c, "pagamento", T.pagamento, partes.join(", ")), ...linha(c, "termo_posterior", T.termoPosterior, termo)];
}

function linhasDoPaciente(e: CompraResumoEntrada, c: Contexto): LinhaDoResumo[] {
  return linha(c, "paciente", T.paciente, nomeEmTitleCase(e.paciente), true);
}

// Courier Simples (o ENVIO) não tem despachante: na cópia, "Despachante: N/A". Sem despachante escolhido, a linha some (no modelo, vazia).
function linhasDoDespachante(e: CompraResumoEntrada, c: Contexto): LinhaDoResumo[] {
  if (limparTextoResumo(e.envio) === MODAL_COURIER_SIMPLES) {
    return linha(c, "despachante", T.despachante, c.modo === "copia" ? T.despachanteNaoAplica : "");
  }
  const d: DespachanteResumo = e.despachante ?? {};
  // "Broker" e os contatos ficam logo abaixo, no mesmo bloco, e só com as linhas que existirem (vêm do Cadastro: não são campo do formulário).
  const contatos = [
    ...linha(NA_COPIA, "broker_telefone", T.brokerTelefone, limparTextoResumo(d.telefone)),
    ...linha(NA_COPIA, "broker_email", T.brokerEmail, limparTextoResumo(d.email)),
    ...linha(NA_COPIA, "broker_contato", T.brokerContato, limparTextoResumo(d.contato)),
  ];
  const cabecalho: LinhaDoResumo[] = contatos.length > 0 ? [{ id: "broker", rotulo: T.broker, valor: "", vazio: false }] : [];
  return [...linha(c, "despachante", T.despachante, limparTextoResumo(d.nome)), ...cabecalho, ...contatos];
}

// A ordem do formulário: Obs., Isenção, Verificação, Pendente, Recorrente.
function linhasDosAvisos(e: CompraResumoEntrada, c: Contexto): LinhaDoResumo[] {
  const a = e.avisos;
  const pendencias = a.pendencias.map(limparTextoResumo).filter((p) => p !== "");
  const documentos =
    a.documentos === null
      ? linha(c, "documentos", T.documentos, "")
      : marcador(c, "documentos", `${T.documentos} ${a.documentos ? T.documentosOk : T.documentosNaoOk}`, true);
  return [
    ...linha(c, "observacoes", T.observacoes, limparTextoResumo(a.observacoes)),
    ...marcador(c, "isencao", T.isencao, a.isencao),
    ...documentos,
    ...linha(c, "pendencias", T.pendencias, pendencias.join(", ")),
    ...marcador(c, "recorrente", T.recorrente, a.recorrente),
  ];
}

function linhasDoProcesso(e: CompraResumoEntrada, c: Contexto): LinhaDoResumo[] {
  return linha(c, "processo", T.numeroProcesso, e.processo.particular ? T.compraParticular : limparTextoResumo(e.processo.numero));
}

// Local de aplicação e entrega: na cópia as DUAS linhas sempre saem e o que estiver vazio vira "pendente ⏳"; no modelo ficam vazias.
function linhasDoLocalEEntrega(e: CompraResumoEntrada, c: Contexto): LinhaDoResumo[] {
  const pendente = c.modo === "copia" ? T.pendenteMarca : "";
  return [
    ...linha(c, "local_aplicacao", T.localAplicacao, limparTextoResumo(e.localAplicacao) || pendente),
    ...linha(c, "entrega", T.entrega, limparTextoResumo(e.entrega) || pendente),
  ];
}

// Um montador por bloco. O tipo Record faz o compilador exigir TODOS os ids de BlocoDaCompra (e recusar um id que não existe).
const MONTADORES: Record<BlocoDaCompra, Montador> = {
  titulo: linhasDoTitulo,
  medicamentos_e_ordens: linhasDoBlocoMedicamentos,
  pagamento: linhasDoPagamento,
  paciente: linhasDoPaciente,
  despachante: linhasDoDespachante,
  avisos: linhasDosAvisos,
  consultor_responsavel: (e, c) => [
    ...linha(c, "consultor", T.consultor, limparTextoResumo(e.consultor)),
    ...linha(c, "responsavel", T.responsavel, limparTextoResumo(e.responsavel)),
  ],
  processo: linhasDoProcesso,
  medico: (e, c) => linha(c, "medico", T.medico, limparTextoResumo(e.medico)),
  local_entrega: linhasDoLocalEEntrega,
  contatos: (e, c) => linha(c, "contatos", T.contatos, limparTextoResumo(e.contatos)),
};

/**
 * O resumo em blocos, na ordem de BLOCOS_DA_COMPRA. "copia": bloco sem linha some. "modelo": todos os rótulos (vazio: true onde não há
 * valor). Não altera a entrada.
 */
export function montarResumo(entrada: CompraResumoEntrada, modo: ModoResumo): BlocoDoResumo[] {
  const contexto: Contexto = { modo };
  return BLOCOS_DA_COMPRA.map((id) => ({ id, linhas: MONTADORES[id](entrada, contexto) })).filter((b) => b.linhas.length > 0);
}

function textoDaLinha(l: LinhaDoResumo): string {
  const valor = l.negrito === true && l.valor !== "" ? `*${l.valor}*` : l.valor;
  if (l.rotulo === "") return valor;
  if (l.vazio) return `${l.rotulo}:`;
  return valor === "" ? l.rotulo : `${l.rotulo}: ${valor}`;
}

/** O texto: uma linha por item, blocos separados por UMA linha em branco, valor em negrito entre asteriscos. Sem quebra no fim. */
export function resumoParaTexto(blocos: readonly BlocoDoResumo[]): string {
  return blocos
    .filter((b) => b.linhas.length > 0)
    .map((b) => b.linhas.map(textoDaLinha).join("\n"))
    .join("\n\n");
}

/** O texto que se copia: `resumoParaTexto(montarResumo(entrada, "copia"))`. */
export const montarResumoCompra = (entrada: CompraResumoEntrada): string => resumoParaTexto(montarResumo(entrada, "copia"));

// ── Da Compra para a entrada do resumo ──────────────────────────────────────────────────────────────────────

/** "2026-11" → { ano: 2026, mes: 11 }; fora do formato, 0 e 0 (o título do resumo some com a parte inválida). */
function anoEMesDe(anoMes: string): { ano: number; mes: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(anoMes);
  return m ? { ano: Number(m[1]), mes: Number(m[2]) } : { ano: 0, mes: 0 };
}

/**
 * Converte o estado de uma Compra (o que o servidor guarda) na entrada do resumo. O despachante vem do Cadastro de despachantes
 * (telefone, e-mail e contato): só entra se for o MESMO da compra (pela chave: sem acento nem caixa) e SÓ esses campos são copiados —
 * a chave PIX nunca passa por aqui (o tipo `DespachanteCadastroResumo` nem tem o campo, e a cópia é campo a campo). Courier Simples
 * é decidido pelo `envio` (o resumo diz "Despachante: N/A"). Sem despachante escolhido: a linha some.
 */
export function compraParaResumoEntrada(compra: Compra, despachanteCadastro: DespachanteCadastroResumo | null = null): CompraResumoEntrada {
  const { ano, mes } = anoEMesDe(compra.anoMes);

  let despachante: DespachanteResumo | null = null;
  if (limparTextoResumo(compra.despachante) !== "") {
    const mesmo = despachanteCadastro !== null && chaveCadastro(limparTextoResumo(despachanteCadastro.nome)) === chaveCadastro(limparTextoResumo(compra.despachante));
    despachante = {
      nome: compra.despachante,
      ...(mesmo ? { telefone: despachanteCadastro.telefone, email: despachanteCadastro.email, contato: despachanteCadastro.contatoNome } : {}),
    };
  }

  return {
    numero: compra.sequencia,
    mes,
    ano,
    medicamentos: compra.itens.map((i) => ({
      medicamento: i.medicamento,
      laboratorio: i.laboratorio,
      brand: i.brand,
      quantidade: i.quantidade,
      temperatura: i.temperatura,
      valorUnitario: i.valorUnitario,
      valorReal: i.valorReal,
    })),
    numeroOrdens: compra.numeroOrdens,
    frete: compra.frete,
    freteReal: compra.freteReal,
    envio: compra.envio,
    cia: compra.cia,
    fornecedor: compra.fornecedor,
    empresa: compra.empresa,
    pagamento: { alvara: compra.pagamentoAlvara, momento: compra.pagamentoMomento },
    termoPosterior: { sim: compra.termoPosterior, observacao: compra.termoObservacao },
    paciente: compra.paciente,
    despachante,
    avisos: {
      isencao: compra.isencao,
      documentos: compra.documentos,
      pendencias: [...compra.pendencias],
      observacoes: compra.observacoes,
      recorrente: compra.recorrente,
    },
    consultor: compra.consultor,
    responsavel: compra.responsavel,
    processo: { particular: compra.compraParticular, numero: compra.processoNumero },
    medico: compra.medico,
    localAplicacao: compra.localAplicacao,
    entrega: compra.entrega,
    contatos: compra.contatos,
  };
}
