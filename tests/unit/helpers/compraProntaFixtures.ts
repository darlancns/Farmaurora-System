import type { FakeSupabase } from "./fakeSupabase";
import { semearConsultores } from "./consultoresFixtures";

// Uma compra PRONTA (sem nada a corrigir na checagem) nas tabelas do FakeSupabase, para os testes do Encaminhar para a DIR. Dados fictícios (TESTE):
// DUAS ordens, a 1ª Air Cargo (cia, despachante da compra) e a 2ª Courier Simples (sem cia); um medicamento em cada.

export const COMPRA_PRONTA_ID = "cmp_teste_000001";
export const COMPRA_PRONTA_VERSAO = "2026-11-19T12:00:00.000Z";

export function linhaCompraPronta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: COMPRA_PRONTA_ID,
    ano_mes: "2026-11",
    sequencia: 1,
    cancelada: false,
    paciente: "paciente  teste da silva",
    processo_numero: "123456",
    medico: "Dr. Teste",
    local_aplicacao: "Local Teste",
    entrega: "Entrega Teste",
    contatos: "",
    termo_observacao: "",
    despachante: "Despachante Teste",
    isencao_para: "",
    observacoes: "",
    vendedor: "Mateus Morais",
    responsavel: "Rebeca",
    compra_particular: false,
    local_declarado: false,
    termo_posterior: false,
    courier_simples: false,
    isencao: false,
    recorrente: false,
    pagamento_alvara: true,
    pagamento_momento: "vamos_pagar",
    documentos: true,
    pendencias: [],
    criado_por: "Teste",
    atualizado_por: "Teste",
    created_at: COMPRA_PRONTA_VERSAO,
    updated_at: COMPRA_PRONTA_VERSAO,
    ...extra,
  };
}

export function linhaOrdemPronta(id: string, posicao: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    compra_id: COMPRA_PRONTA_ID,
    posicao,
    fornecedor: "Fornecedor Teste",
    envio: "Air Cargo",
    cia: "Cia Teste",
    po: `PO26-11-000${posicao}`,
    frete: null,
    frete_real: null,
    dir_id: null,
    encaminhada_em: null,
    ...extra,
  };
}

export function linhaItemPronto(id: string, ordemId: string, posicao: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    ordem_id: ordemId,
    posicao,
    medicamento: "MED TESTE",
    medicamento_cadastro_id: "med_1",
    pre_cadastro_id: null,
    apresentacao: "10 mg",
    referencia: "",
    laboratorio: "",
    quantidade: "2 caixas",
    temperatura: "2°C a 8°C",
    valor_unitario: null,
    valor_real: null,
    ...extra,
  };
}

/** Semeia a compra pronta (e os consultores ativos do Cadastro, que a validação do vendedor lê). `extraCompra` troca colunas da compra. */
export function semearCompraPronta(fake: FakeSupabase, extraCompra: Record<string, unknown> = {}): void {
  fake.tabelas.compras = [linhaCompraPronta(extraCompra)];
  fake.tabelas.compra_ordens = [linhaOrdemPronta("ord_teste_0001", 1), linhaOrdemPronta("ord_teste_0002", 2, { envio: "Courier Simples", cia: "" })];
  fake.tabelas.compra_itens = [
    linhaItemPronto("itm_teste_0001", "ord_teste_0001", 1),
    linhaItemPronto("itm_teste_0002", "ord_teste_0002", 1, { medicamento: "OUTRO MED", apresentacao: "" }),
  ];
  fake.tabelas.dir = [];
  semearConsultores(fake);
}
