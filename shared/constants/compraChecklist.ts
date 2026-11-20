// A checagem única da compra (shared/utils/compraChecklist.ts): os ids das regras e TODOS os textos num lugar só. Para ajustar a
// redação, mexa aqui (nada de texto solto na função). Textos curtos, no estilo "PO da ordem 2 não preenchido".

/** O texto da linha da DIR (textoMedicamentoDir) passa disto? Mesmo limite do campo `medicamento` da DIR. */
export const DIR_MEDICAMENTO_MAX = 300;

/** Separador entre os medicamentos de uma ordem no texto que vai para a DIR. */
export const DIR_MEDICAMENTO_SEPARADOR = " + ";

export type NivelChecklist = "ok" | "erro" | "aviso";

/**
 * Os ids das regras (o `id` de cada item do checklist é um destes, com `ordem-N` e `med-M` na frente quando a regra é de uma ordem
 * ou de um medicamento: ex. "ordem-2-po", "ordem-2-med-1-quantidade"). A tela pode usar o id para levar a pessoa ao campo.
 */
export const REGRAS_CHECKLIST = {
  paciente: "paciente",
  processo: "processo",
  medico: "medico",
  vendedor: "vendedor",
  responsavel: "responsavel",
  ordens: "ordens",
  fornecedor: "fornecedor",
  envio: "envio",
  po: "po",
  poNaDir: "po-na-dir",
  encaminhada: "encaminhada",
  medicamentos: "medicamentos",
  medNome: "nome",
  medTemperatura: "temperatura",
  medQuantidade: "quantidade",
  textoDir: "texto-dir",
  despachante: "despachante",
  pagamentoMomento: "pagamento-momento",
  preCadastro: "pre-cadastro",
  localAplicacao: "local-aplicacao",
  entrega: "entrega",
  documentos: "documentos",
} as const;

/** Os textos. Cada regra de erro tem o texto de quando falta (`falta`) e de quando está atendida (`ok`). */
export const TEXTOS_CHECKLIST = {
  paciente: { falta: "Paciente não preenchido", ok: "Paciente preenchido" },
  processo: { falta: "Processo não preenchido (ou marque compra particular)", ok: "Processo preenchido", okParticular: "Compra particular (sem processo)" },
  medico: { falta: "Médico não preenchido", ok: "Médico preenchido" },
  vendedor: { falta: "Vendedor não preenchido", ok: "Vendedor preenchido" },
  responsavel: { falta: "Responsável não preenchido", ok: "Responsável preenchido" },
  ordens: { falta: "Nenhuma ordem na compra", ok: (n: number): string => (n === 1 ? "1 ordem" : `${n} ordens`) },

  fornecedor: { falta: (o: number): string => `Fornecedor da ordem ${o} não preenchido`, ok: (o: number): string => `Fornecedor da ordem ${o} preenchido` },
  envio: { falta: (o: number): string => `Envio da ordem ${o} não preenchido`, ok: (o: number): string => `Envio da ordem ${o} preenchido` },
  po: {
    falta: (o: number): string => `PO da ordem ${o} não preenchido`,
    invalido: (o: number): string => `PO da ordem ${o} fora do formato (PO00-00-0000)`,
    ok: (o: number): string => `PO da ordem ${o} preenchido`,
  },
  poNaDir: {
    erro: (po: string): string => `PO ${po} já existe na DIR`,
    ok: (po: string): string => `PO ${po} não está na DIR`,
  },
  encaminhada: { ok: (o: number, dia: string): string => (dia === "" ? `Ordem ${o} encaminhada` : `Ordem ${o} encaminhada em ${dia}`) },
  medicamentos: { falta: (o: number): string => `Ordem ${o} sem medicamento`, ok: (o: number): string => (`Ordem ${o} com medicamento`) },
  medNome: {
    falta: (o: number, m: number): string => `Medicamento ${m} da ordem ${o}: nome não preenchido`,
    ok: (o: number, m: number): string => `Medicamento ${m} da ordem ${o}: nome preenchido`,
  },
  medTemperatura: {
    falta: (o: number, m: number): string => `Medicamento ${m} da ordem ${o}: temperatura não preenchida`,
    ok: (o: number, m: number): string => `Medicamento ${m} da ordem ${o}: temperatura preenchida`,
  },
  medQuantidade: {
    falta: (o: number, m: number): string => `Medicamento ${m} da ordem ${o}: quantidade não preenchida`,
    ok: (o: number, m: number): string => `Medicamento ${m} da ordem ${o}: quantidade preenchida`,
  },
  textoDir: {
    erro: (o: number, tamanho: number, max: number): string => `Texto da DIR da ordem ${o} tem ${tamanho} caracteres (máximo ${max})`,
    ok: (o: number, tamanho: number, max: number): string => `Texto da DIR da ordem ${o}: ${tamanho} de ${max} caracteres`,
  },

  despachante: {
    falta: "Despachante não preenchido",
    ok: "Despachante preenchido",
    dispensado: "Despachante dispensado (Courier Simples)",
  },
  pagamentoMomento: { falta: "Momento do pagamento não escolhido", ok: "Momento do pagamento escolhido" },

  // Avisos (não bloqueiam; só aparecem quando valem).
  preCadastro: (nome: string): string => `${nome} no pré-cadastro: a linha da DIR leva o nome digitado`,
  localAplicacao: (marca: string): string => `Local de aplicação vazio (sai "${marca}" no resumo)`,
  entrega: (marca: string): string => `Entrega vazia (sai "${marca}" no resumo)`,
  documentos: "Documentos não verificados",
} as const;
