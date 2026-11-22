// Blocos e frases fixas do "Resumo da compra" (shared/utils/compraResumo.ts).

/** Os ids dos blocos do resumo. Escrito à mão (e não derivado do array) para o compilador conferir os dois lados. */
export type BlocoDaCompra =
  | "titulo"
  | "medicamentos_e_ordens"
  | "pagamento"
  | "paciente"
  | "despachante"
  | "avisos"
  | "consultor_responsavel"
  | "processo"
  | "medico"
  | "local_entrega"
  | "contatos";

/**
 * Os blocos NA ORDEM do resumo (cada um vira um parágrafo; a linha em branco entre eles é a única separação). É a FONTE ÚNICA da
 * ordem dos blocos. A ordem das LINHAS (a mesma do formulário, conferida em comprasBlocosOrdem.spec.ts: Medicamento, Laboratório, Brand,
 * Quantidade, Ordens, Valor unitário...) está em shared/utils/compraResumo.ts.
 *
 * `satisfies` barra um id que não existe; a conferência logo abaixo barra um id ESQUECIDO (não compila). Repetido, só o teste pega.
 */
export const BLOCOS_DA_COMPRA = [
  "titulo",
  "medicamentos_e_ordens",
  "pagamento",
  "paciente",
  "despachante",
  "avisos",
  "consultor_responsavel",
  "processo",
  "medico",
  "local_entrega",
  "contatos",
] as const satisfies readonly BlocoDaCompra[];

// Compila só se TODO id de BlocoDaCompra está em BLOCOS_DA_COMPRA (senão `Faltando` não é `never` e o `true` não cabe).
type Faltando = Exclude<BlocoDaCompra, (typeof BLOCOS_DA_COMPRA)[number]>;
export const TODOS_OS_BLOCOS_ESTAO_NA_ORDEM: [Faltando] extends [never] ? true : Faltando = true;

/**
 * TODAS as frases fixas do resumo num lugar só: para ajustar a redação, mexa aqui (nada de texto solto na função).
 * Os rótulos levam os dois pontos fora ("Quantidade" + ": " + valor); `pendenteMarca` e os emojis fazem parte do texto.
 */
export const TEXTOS_RESUMO = {
  // título: `*Compra NN - Mês/Ano*`
  compra: "Compra",
  meses: [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ],

  // medicamentos e ordens
  medicamento: "Medicamento",
  laboratorio: "Laboratório",
  brand: "Brand",
  quantidade: "Quantidade",
  ordens: "Ordens",
  valorUnitario: "Valor Unitário",
  valorReal: "Valor Real",
  frete: "Frete",
  valorRealFrete: "Valor real do Frete",
  envio: "Envio",
  ciaAbre: "(",
  ciaFecha: ")",
  fornecedor: "Fornecedor",
  cnpj: "CNPJ",
  temperatura: "Temperatura",

  // pagamento
  pagamento: "Pagamento",
  alvaraNaConta: "alvará na conta",
  vamosPagar: "vamos pagar",
  aposAwb: "após o envio da AWB",
  termoPosterior: "Termo de pagamento posterior",
  termoSim: "Sim",
  termoNaoAplica: "n/a",

  // paciente
  paciente: "Paciente",

  // despachante
  despachante: "Despachante",
  despachanteNaoAplica: "N/A",
  broker: "Broker",
  brokerTelefone: "Phone",
  brokerEmail: "Email",
  brokerContato: "Contact",

  // avisos
  isencao: "Pedir isenção imposto ❗",
  documentos: "Verificação de documento e validação de assinatura",
  documentosOk: "✅",
  documentosNaoOk: "❌",
  pendencias: "Pendente",
  observacoes: "Obs.",
  recorrente: "Recorrente",

  // consultor e responsável
  consultor: "Consultor",
  responsavel: "Responsável",

  // processo
  numeroProcesso: "Número do processo",
  compraParticular: "Compra particular",

  // médico
  medico: "Médico(a)",

  // local e entrega
  localAplicacao: "Local de aplicação",
  entrega: "Entrega (Doctor/AJC)",
  pendenteMarca: "pendente ⏳",

  // contatos
  contatos: "Contatos",

  // pontuação do formato
  separadorValores: " | ",
  valorVazio: "-",
} as const;
