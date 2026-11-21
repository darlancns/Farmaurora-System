import type { Compra, ItemCompra } from "../../../shared/types/compra";

// Fixtures SINTÉTICAS da compra no modelo "uma compra por fornecedor" (itens direto na compra, `numeroOrdens` só um número, consultor).
// Dados fictícios (TESTE): nunca nome de paciente real.

export function itemDeTeste(posicao: number, extra: Partial<ItemCompra> = {}): ItemCompra {
  return {
    id: `itm_teste_000${posicao}`,
    posicao,
    medicamento: "MED TESTE",
    medicamentoCadastroId: null,
    medicamentoCadastroNome: null,
    preCadastroId: null,
    laboratorio: "",
    brand: "",
    quantidade: "",
    temperatura: "",
    valorUnitario: null,
    valorReal: null,
    ...extra,
  };
}

/** Uma compra VAZIA (recém-criada): só o que o servidor preenche sozinho. */
export function compraVaziaDeTeste(extra: Partial<Compra> = {}): Compra {
  return {
    id: "cmp_teste_000001",
    anoMes: "2026-11",
    sequencia: 3,
    cancelada: false,
    fornecedor: "",
    envio: "",
    cia: "",
    empresa: "FARMAURORA",
    numeroOrdens: 1,
    frete: null,
    freteReal: null,
    paciente: "",
    processoNumero: "",
    compraParticular: false,
    recorrente: false,
    medico: "",
    localAplicacao: "",
    entrega: "",
    contatos: "",
    despachante: "",
    pagamentoAlvara: null,
    pagamentoMomento: null,
    termoPosterior: false,
    termoObservacao: "",
    isencao: false,
    documentos: null,
    pendencias: [],
    observacoes: "",
    consultor: "",
    responsavel: "",
    criadoPor: "Cris",
    atualizadoPor: "Cris",
    createdAt: "2026-11-19T12:00:00.000Z",
    updatedAt: "2026-11-19T13:00:00.000Z",
    itens: [],
    ...extra,
  };
}

/** Uma compra COMPLETA (tudo preenchido, 1 medicamento, Air Cargo com cia). */
export function compraDeTeste(extra: Partial<Compra> = {}): Compra {
  return compraVaziaDeTeste({
    fornecedor: "Fornecedor Teste",
    envio: "Air Cargo",
    cia: "Emirates",
    numeroOrdens: 2,
    frete: 150,
    freteReal: 120.5,
    paciente: "PACIENTE TESTE DA SILVA",
    processoNumero: "0000000-00.2026.8.26.0100",
    medico: "Dra. Teste",
    localAplicacao: "Hospital Teste",
    entrega: "Rua Teste, 100",
    contatos: "(11) 90000-0000",
    despachante: "Despachante Teste",
    pagamentoAlvara: true,
    pagamentoMomento: "vamos_pagar",
    documentos: true,
    pendencias: ["Aguardando fatura"],
    observacoes: "Observação de teste",
    consultor: "Consultor Teste",
    responsavel: "Responsável Teste",
    itens: [
      itemDeTeste(1, {
        medicamento: "MED TESTE 10 mg",
        medicamentoCadastroId: "med_1",
        medicamentoCadastroNome: "MED TESTE",
        laboratorio: "Lab Teste",
        brand: "bioequivalente",
        quantidade: "12 ampolas",
        temperatura: "2°C a 8°C",
        valorUnitario: 10,
        valorReal: 120,
      }),
    ],
    ...extra,
  });
}
