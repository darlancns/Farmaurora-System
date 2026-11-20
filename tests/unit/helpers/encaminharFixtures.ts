import type { Compra, LinhaDaPrevia, OrdemCompra, PreviaEncaminhar } from "../../../shared/types/compra";
import { novoDir } from "./dirFixtures";

// Fixtures SINTÉTICAS do painel "Encaminhar para a DIR" (compra, ordens, prévia). Dados fictícios (TESTE).

export function ordemTeste(posicao: number, extra: Partial<OrdemCompra> = {}): OrdemCompra {
  return {
    id: `ord_teste_000${posicao}`,
    posicao,
    fornecedor: "Fornecedor Teste",
    envio: "Air Cargo",
    cia: "Cia Teste",
    po: `PO26-12-999${8 + posicao - 1}`,
    frete: null,
    freteReal: null,
    dirId: null,
    encaminhadaEm: null,
    itens: [
      {
        id: `itm_teste_000${posicao}`,
        posicao: 1,
        medicamento: "MED TESTE",
        medicamentoCadastroId: "med_1",
        preCadastroId: null,
        apresentacao: "10 mg",
        referencia: "",
        laboratorio: "",
        quantidade: "2 caixas",
        temperatura: "2°C a 8°C",
        valorUnitario: null,
        valorReal: null,
      },
    ],
    ...extra,
  };
}

export function compraTeste(extra: Partial<Compra> = {}): Compra {
  return {
    id: "cmp_teste_000001",
    anoMes: "2026-12",
    sequencia: 3,
    cancelada: false,
    paciente: "TESTE PACIENTE",
    processoNumero: "123456",
    medico: "Dr. Teste",
    localAplicacao: "Local Teste",
    entrega: "Entrega Teste",
    contatos: "",
    termoObservacao: "",
    despachante: "Despachante Teste",
    isencaoPara: "",
    observacoes: "",
    vendedor: "Mateus Morais",
    responsavel: "Rebeca",
    compraParticular: false,
    localDeclarado: false,
    termoPosterior: false,
    courierSimples: false,
    isencao: false,
    recorrente: false,
    pagamentoAlvara: true,
    pagamentoMomento: "vamos_pagar",
    documentos: true,
    pendencias: [],
    criadoPor: "Teste",
    atualizadoPor: "Teste",
    createdAt: "2026-12-01T12:00:00.000Z",
    updatedAt: "2026-12-01T12:00:00.000Z",
    ordens: [ordemTeste(1), ordemTeste(2, { envio: "Courier Simples", cia: "" })],
    ...extra,
  };
}

export function linhaPrevia(ordem: OrdemCompra, extra: Partial<LinhaDaPrevia> = {}, dir: Partial<LinhaDaPrevia["dir"]> = {}): LinhaDaPrevia {
  return {
    ordemPosicao: ordem.posicao,
    ordemId: ordem.id,
    temperaturaMista: false,
    jaEncaminhada: ordem.dirId !== null,
    dir: novoDir({
      id: `dir_${ordem.id}`,
      po: ordem.po,
      paciente: "TESTE PACIENTE",
      vendedor: "Mateus Morais",
      responsavel: "Rebeca",
      medicamento: "MED TESTE 10 MG",
      fornecedor: ordem.fornecedor,
      envio: ordem.envio,
      companhiaAerea: ordem.cia,
      despachante: ordem.envio === "Courier Simples" ? "COURIER I N/A" : "Despachante Teste",
      temperatura: "2°C a 8°C",
      observacao: "",
      status: "on_going",
      awb: "",
      contratoCambio: "",
      banco: "",
      receita: "",
      ...dir,
    }),
    ...extra,
  };
}

/** A prévia de uma compra SEM impedimentos (uma linha por ordem). */
export function previaTeste(compra: Compra, extra: Partial<PreviaEncaminhar> = {}): PreviaEncaminhar {
  return { linhas: compra.ordens.map((o) => linhaPrevia(o)), conflitosPo: [], erros: [], vendedorInativo: false, posRepetidosNaCompra: [], ...extra };
}
