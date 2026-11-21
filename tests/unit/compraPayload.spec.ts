import { describe, expect, it } from "vitest";
import type { Compra } from "../../shared/types/compra";
import { itemDaLista } from "../../shared/utils/compraLista";
import { corpoParaSalvar } from "../../shared/utils/compraPayload";
import { validarCompraSalvar } from "../../shared/utils/compraValidacao";

// O corpo do salvamento automático a partir da compra do formulário, e o item da lista a partir da mesma compra. Dados fictícios (TESTE).

const compra = (extra: Partial<Compra> = {}): Compra => ({
  id: "cmp_teste_000001",
  anoMes: "2026-11",
  sequencia: 4,
  cancelada: false,
  fornecedor: "Fornecedor Teste",
  envio: "Air Cargo",
  cia: "Emirates",
  empresa: "FARMAURORA",
  numeroOrdens: 2,
  frete: 150,
  freteReal: null,
  paciente: "TESTE PACIENTE",
  processoNumero: "123",
  compraParticular: false,
  recorrente: true,
  medico: "Dr. Teste",
  localAplicacao: "Local",
  entrega: "Entrega",
  contatos: "",
  despachante: "Despachante Teste",
  pagamentoAlvara: true,
  pagamentoMomento: "vamos_pagar",
  termoPosterior: false,
  termoObservacao: "",
  isencao: true,
  documentos: null,
  pendencias: ["Receita"],
  observacoes: "obs",
  consultor: "Consultor Teste",
  responsavel: "Responsável Teste",
  criadoPor: "Cris",
  atualizadoPor: "Cris",
  createdAt: "2026-11-19T12:00:00.000Z",
  updatedAt: "2026-11-19T12:00:00.000Z",
  itens: [
    { id: "itm_000002", posicao: 2, medicamento: "SEGUNDO", medicamentoCadastroId: null, medicamentoCadastroNome: null, preCadastroId: "pre_1", preCadastroStatus: "rejeitado", laboratorio: "", brand: "", quantidade: "1", temperatura: "", valorUnitario: null, valorReal: 2 },
    { id: "itm_000001", posicao: 1, medicamento: "PRIMEIRO 10 mg", medicamentoCadastroId: "med_1", medicamentoCadastroNome: "PRIMEIRO", preCadastroId: null, laboratorio: "Lab", brand: "bioequivalente", quantidade: "12 ampolas", temperatura: "Ambiente", valorUnitario: 10.5, valorReal: null },
  ],
  ...extra,
});

describe("corpoParaSalvar", () => {
  it("é o ESTADO COMPLETO: a versão, todos os campos editáveis (consultor, não vendedor) e os itens por posição, sem posicao nem campos só de leitura", () => {
    const corpo = corpoParaSalvar(compra(), "2026-11-19T12:00:00.000Z");
    expect(corpo.atualizadoEm).toBe("2026-11-19T12:00:00.000Z");
    expect(corpo).toMatchObject({ fornecedor: "Fornecedor Teste", envio: "Air Cargo", cia: "Emirates", empresa: "FARMAURORA", numeroOrdens: 2, frete: 150, freteReal: null, consultor: "Consultor Teste", pendencias: ["Receita"] });
    expect(corpo.itens!.map((i) => i.id)).toEqual(["itm_000001", "itm_000002"]);
    const texto = JSON.stringify(corpo);
    for (const fora of ["posicao", "medicamentoCadastroNome", "preCadastroStatus", "vendedor", "ordens", "courierSimples", "localDeclarado", "isencaoPara", "apresentacao", "referencia", "criadoPor", "updatedAt"]) {
      expect(texto, fora).not.toContain(fora);
    }
  });

  it("ida e volta: o corpo é aceito pela validação do servidor, com os itens (inclusive o ligado ao Cadastro)", () => {
    const r = validarCompraSalvar(corpoParaSalvar(compra(), "2026-11-19T12:00:00.000Z"));
    expect(r.ok, r.ok ? "" : r.erro).toBe(true);
    if (r.ok) {
      expect(r.valor.itens).toHaveLength(2);
      expect(r.valor.campos).toMatchObject({ numeroOrdens: 2, empresa: "FARMAURORA", consultor: "Consultor Teste" });
    }
  });

  it("não altera a compra recebida (nem a ordem dos itens dela)", () => {
    const c = compra();
    const antes = JSON.stringify(c);
    corpoParaSalvar(c, c.updatedAt);
    expect(JSON.stringify(c)).toBe(antes);
  });
});

describe("itemDaLista", () => {
  it("só o necessário para a linha: nomes dos medicamentos por posição, sem repetir nem vazios, e o número de ordens", () => {
    const c = compra({ itens: [...compra().itens, { ...compra().itens[0]!, id: "itm_000003", posicao: 3, medicamento: " SEGUNDO " }, { ...compra().itens[0]!, id: "itm_000004", posicao: 4, medicamento: "  " }] });
    const l = itemDaLista({ ...c, atualizadoEm: c.updatedAt });
    expect(l).toEqual({ id: "cmp_teste_000001", anoMes: "2026-11", sequencia: 4, cancelada: false, paciente: "TESTE PACIENTE", medicamentos: ["PRIMEIRO 10 mg", "SEGUNDO"], numeroOrdens: 2, atualizadoEm: "2026-11-19T12:00:00.000Z" });
  });
});
