import { describe, expect, it } from "vitest";
import type {
  AtualizarCotacaoDTO,
  BancoCambio,
  LancamentoBanco,
  LoteBanco,
  OpcaoCotacao,
  TaxaLancamentoRendimento,
} from "#shared/types/Pagamento";
import { useCotacaoDrafts } from "../../app/composables/useCotacaoDrafts";
import { useEscolherBanco } from "../../app/composables/useEscolherBanco";

// Caracterização de escolher/confirmarRendimento/podeEscolher (Round 9) —
// regra de "usar este banco": XP/Intex direto; Rendimento com 1 pendente
// aplica direto; Rendimento com 2+ (ou 0 — ver achado abaixo) abre o modal.
// Comportamento ATUAL, sem corrigir nada.
//
// Monta useCotacaoDrafts + useEscolherBanco juntos (não um stub isolado) pra
// confirmar que a composição — useEscolherBanco consumindo draftToOpcoes de
// useCotacaoDrafts em vez de duplicá-la — funciona de ponta a ponta.

function opcao(banco: OpcaoCotacao["banco"], taxa: number | null, taxaCorretagem = 0): OpcaoCotacao {
  return { banco, taxa, taxaCorretagem };
}

function lote(id: string, opcoes: OpcaoCotacao[]): LoteBanco {
  return {
    id,
    data: "2026-01-01",
    empresa: "FARMAURORA",
    moeda: "USD",
    numeroLote: 1,
    opcoes,
    bancoEscolhido: null,
    taxaEscolhida: null,
    realizado: false,
    pagoEm: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function lancamento(id: string, loteId: string, valorReais: number | null): LancamentoBanco {
  return {
    id,
    loteId,
    data: "2026-01-01",
    empresa: "FARMAURORA",
    fornecedor: "Beldimed - Bélgica",
    invoice: "INV-1",
    cliente: "Paciente Teste",
    valorMoeda: 100,
    moeda: "USD",
    valorReais,
    taxa: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

interface ChamadaEscolherBanco {
  loteId: string;
  banco: BancoCambio;
  opcoes: NonNullable<AtualizarCotacaoDTO["opcoes"]>;
}
interface ChamadaEscolherBancoRendimento {
  loteId: string;
  opcoes: NonNullable<AtualizarCotacaoDTO["opcoes"]>;
  taxas: TaxaLancamentoRendimento[];
}
interface ChamadaSalvarTaxas {
  loteId: string;
  opcoes: NonNullable<AtualizarCotacaoDTO["opcoes"]>;
}

function setup(
  lotes: LoteBanco[],
  lancamentos: LancamentoBanco[],
  opts: { readonly?: boolean; resultadoEscolherBanco?: boolean; resultadoEscolherBancoRendimento?: boolean } = {},
) {
  const cotacaoDrafts = useCotacaoDrafts({ lotes: () => lotes });

  const chamadasEscolherBanco: ChamadaEscolherBanco[] = [];
  const chamadasEscolherBancoRendimento: ChamadaEscolherBancoRendimento[] = [];
  const chamadasSalvarTaxas: ChamadaSalvarTaxas[] = [];
  const chamadasCancelarAutoSave: string[] = [];

  const escolhaBanco = useEscolherBanco({
    lotesAbertos: () => lotes,
    lancamentosDoLote: (loteId) => lancamentos.filter((l) => l.loteId === loteId),
    drafts: cotacaoDrafts.drafts,
    draftDo: cotacaoDrafts.draftDo,
    draftToOpcoes: cotacaoDrafts.draftToOpcoes,
    parseTaxa: cotacaoDrafts.parseTaxa,
    readonly: () => opts.readonly ?? false,
    cancelarAutoSave: (loteId) => chamadasCancelarAutoSave.push(loteId),
    salvarTaxas: (loteId, opcoes) => chamadasSalvarTaxas.push({ loteId, opcoes }),
    escolherBanco: async (loteId, banco, opcoes) => {
      chamadasEscolherBanco.push({ loteId, banco, opcoes });
      return opts.resultadoEscolherBanco ?? true;
    },
    escolherBancoRendimento: async (loteId, opcoes, taxas) => {
      chamadasEscolherBancoRendimento.push({ loteId, opcoes, taxas });
      return opts.resultadoEscolherBancoRendimento ?? true;
    },
  });

  return {
    cotacaoDrafts,
    escolhaBanco,
    chamadasEscolherBanco,
    chamadasEscolherBancoRendimento,
    chamadasSalvarTaxas,
    chamadasCancelarAutoSave,
  };
}

describe("useEscolherBanco / escolher", () => {
  it("XP: escolhe direto, sem modal e sem passar por Rendimento", async () => {
    const lotes = [lote("L1", [opcao("XP", 5, 10)])];
    const { escolhaBanco, chamadasEscolherBanco, chamadasEscolherBancoRendimento, chamadasSalvarTaxas, chamadasCancelarAutoSave } =
      setup(lotes, []);

    await escolhaBanco.escolher("L1", "XP");

    expect(chamadasCancelarAutoSave).toEqual(["L1"]);
    expect(chamadasEscolherBanco).toEqual([
      { loteId: "L1", banco: "XP", opcoes: [{ banco: "XP", taxa: 5, taxaCorretagem: 10 }] },
    ]);
    expect(chamadasEscolherBancoRendimento).toEqual([]);
    // XP não re-emite salvar-taxas — o valor viaja embutido no próprio escolherBanco.
    expect(chamadasSalvarTaxas).toEqual([]);
    expect(escolhaBanco.modalRendimento.value).toBeNull();
    expect(escolhaBanco.salvando.value).toBeNull();
  });

  it("Intex: escolhe direto, mesmo caminho do XP", async () => {
    const lotes = [lote("L1", [opcao("INTEX", 7.2, 0)])];
    const { escolhaBanco, chamadasEscolherBanco } = setup(lotes, []);

    await escolhaBanco.escolher("L1", "INTEX");

    expect(chamadasEscolherBanco).toEqual([
      { loteId: "L1", banco: "INTEX", opcoes: [{ banco: "INTEX", taxa: 7.2, taxaCorretagem: 0 }] },
    ]);
  });

  it("Rendimento com exatamente 1 pendente: aplica direto, sem abrir o modal", async () => {
    const lotes = [lote("L1", [opcao("RENDIMENTO", 5, 8)])];
    const lancamentos = [lancamento("LC1", "L1", null)];
    const { escolhaBanco, chamadasEscolherBancoRendimento, chamadasSalvarTaxas } = setup(lotes, lancamentos);

    await escolhaBanco.escolher("L1", "RENDIMENTO");

    // Persiste o rascunho antes de decidir o caminho (mesmo pra 1 pendente).
    expect(chamadasSalvarTaxas).toEqual([
      { loteId: "L1", opcoes: [{ banco: "RENDIMENTO", taxa: 5, taxaCorretagem: 8 }] },
    ]);
    expect(chamadasEscolherBancoRendimento).toEqual([
      {
        loteId: "L1",
        opcoes: [{ banco: "RENDIMENTO", taxa: 5, taxaCorretagem: 8 }],
        taxas: [{ lancamentoId: "LC1", taxa: 5 }],
      },
    ]);
    expect(escolhaBanco.modalRendimento.value).toBeNull();
  });

  it("Rendimento com 1 pendente mas sem taxa preenchida: não faz nada (botão só habilita com taxa)", async () => {
    const lotes = [lote("L1", [opcao("RENDIMENTO", null, 0)])];
    const lancamentos = [lancamento("LC1", "L1", null)];
    const { escolhaBanco, chamadasEscolherBancoRendimento } = setup(lotes, lancamentos);

    await escolhaBanco.escolher("L1", "RENDIMENTO");

    expect(chamadasEscolherBancoRendimento).toEqual([]);
    expect(escolhaBanco.modalRendimento.value).toBeNull();
  });

  it("Rendimento com 2+ pendentes: abre o modal, ainda não confirma nada", async () => {
    const lotes = [lote("L1", [opcao("RENDIMENTO", 5, 8)])];
    const lancamentos = [lancamento("LC1", "L1", null), lancamento("LC2", "L1", null)];
    const { escolhaBanco, chamadasEscolherBancoRendimento, chamadasSalvarTaxas } = setup(lotes, lancamentos);

    await escolhaBanco.escolher("L1", "RENDIMENTO");

    expect(chamadasSalvarTaxas).toEqual([
      { loteId: "L1", opcoes: [{ banco: "RENDIMENTO", taxa: 5, taxaCorretagem: 8 }] },
    ]);
    expect(chamadasEscolherBancoRendimento).toEqual([]);
    expect(escolhaBanco.modalRendimento.value).toEqual({
      loteId: "L1",
      moeda: "USD",
      lancamentos: [lancamentos[0], lancamentos[1]],
      corretagem: 8,
    });
  });

  it("achado: Rendimento com 0 pendentes cai no mesmo caminho do '2+' e abre o modal vazio", async () => {
    const lotes = [lote("L1", [opcao("RENDIMENTO", 5, 0)])];
    const { escolhaBanco, chamadasEscolherBancoRendimento } = setup(lotes, []);

    await escolhaBanco.escolher("L1", "RENDIMENTO");

    // "pendentes.length === 1" é falso tanto pra 0 quanto pra 2+, então 0
    // pendentes cai no branch do modal em vez de não fazer nada — não há
    // nenhuma guarda pra esse caso. Comportamento preservado, não corrigido.
    expect(chamadasEscolherBancoRendimento).toEqual([]);
    expect(escolhaBanco.modalRendimento.value).toEqual({
      loteId: "L1",
      moeda: "USD",
      lancamentos: [],
      corretagem: 0,
    });
  });

  it("lote inexistente em lotesAbertos: não faz nada (nem salvarTaxas, nem modal)", async () => {
    const { escolhaBanco, chamadasSalvarTaxas, chamadasCancelarAutoSave } = setup([], []);

    await escolhaBanco.escolher("nao-existe", "RENDIMENTO");

    expect(chamadasCancelarAutoSave).toEqual(["nao-existe"]);
    expect(chamadasSalvarTaxas).toEqual([]);
    expect(escolhaBanco.modalRendimento.value).toBeNull();
  });

  it("composição com useCotacaoDrafts: edição no rascunho reflete no que é enviado a escolherBanco", async () => {
    const lotes = [lote("L1", [opcao("XP", 5, 0)])];
    const { cotacaoDrafts, escolhaBanco, chamadasEscolherBanco } = setup(lotes, []);

    const draft = cotacaoDrafts.drafts["L1"]!.find((d) => d.banco === "XP")!;
    draft.taxaStr = "9,25"; // usuário edita antes de clicar em "Usar este banco"

    await escolhaBanco.escolher("L1", "XP");

    expect(chamadasEscolherBanco[0]?.opcoes).toEqual([{ banco: "XP", taxa: 9.25, taxaCorretagem: 0 }]);
  });
});

describe("useEscolherBanco / confirmarRendimento", () => {
  it("fecha o modal só depois do servidor confirmar (sucesso)", async () => {
    const lotes = [lote("L1", [opcao("RENDIMENTO", 5, 0)])];
    const lancamentos = [lancamento("LC1", "L1", null), lancamento("LC2", "L1", null)];
    const { escolhaBanco, chamadasEscolherBancoRendimento } = setup(lotes, lancamentos);

    await escolhaBanco.escolher("L1", "RENDIMENTO"); // abre o modal
    expect(escolhaBanco.modalRendimento.value).not.toBeNull();

    const taxas: TaxaLancamentoRendimento[] = [
      { lancamentoId: "LC1", taxa: 5 },
      { lancamentoId: "LC2", taxa: 5.1 },
    ];
    await escolhaBanco.confirmarRendimento(taxas);

    expect(chamadasEscolherBancoRendimento.at(-1)).toEqual({
      loteId: "L1",
      opcoes: [{ banco: "RENDIMENTO", taxa: 5, taxaCorretagem: 0 }],
      taxas,
    });
    expect(escolhaBanco.modalRendimento.value).toBeNull();
    expect(escolhaBanco.rendimentoErro.value).toBeNull();
  });

  it("mantém o modal aberto com mensagem de erro quando o servidor recusa", async () => {
    const lotes = [lote("L1", [opcao("RENDIMENTO", 5, 0)])];
    const lancamentos = [lancamento("LC1", "L1", null), lancamento("LC2", "L1", null)];
    const { escolhaBanco } = setup(lotes, lancamentos, { resultadoEscolherBancoRendimento: false });

    await escolhaBanco.escolher("L1", "RENDIMENTO");
    await escolhaBanco.confirmarRendimento([
      { lancamentoId: "LC1", taxa: 5 },
      { lancamentoId: "LC2", taxa: 5.1 },
    ]);

    expect(escolhaBanco.modalRendimento.value).not.toBeNull();
    expect(escolhaBanco.rendimentoErro.value).toBe("Não foi possível confirmar o fechamento. Tente novamente.");
  });

  it("sem modal aberto: não faz nada", async () => {
    const { escolhaBanco, chamadasEscolherBancoRendimento } = setup([], []);
    await escolhaBanco.confirmarRendimento([]);
    expect(chamadasEscolherBancoRendimento).toEqual([]);
  });
});

describe("useEscolherBanco / podeEscolher", () => {
  it("true quando há taxa válida, não é readonly e não está em voo", () => {
    const lotes = [lote("L1", [opcao("XP", 5, 0)])];
    const { escolhaBanco } = setup(lotes, []);
    expect(escolhaBanco.podeEscolher(lotes[0]!, "XP")).toBe(true);
  });

  it("false quando readonly", () => {
    const lotes = [lote("L1", [opcao("XP", 5, 0)])];
    const { escolhaBanco } = setup(lotes, [], { readonly: true });
    expect(escolhaBanco.podeEscolher(lotes[0]!, "XP")).toBe(false);
  });

  it("false quando o rascunho não tem taxa válida", () => {
    const lotes = [lote("L1", [opcao("XP", null, 0)])];
    const { escolhaBanco } = setup(lotes, []);
    expect(escolhaBanco.podeEscolher(lotes[0]!, "XP")).toBe(false);
  });

  it("false enquanto a escolha desse lote+banco está em voo, true de novo depois", async () => {
    const lotes = [lote("L1", [opcao("XP", 5, 0)])];
    const cotacaoDrafts = useCotacaoDrafts({ lotes: () => lotes });
    let resolver!: (v: boolean) => void;
    const escolhaBanco = useEscolherBanco({
      lotesAbertos: () => lotes,
      lancamentosDoLote: () => [],
      drafts: cotacaoDrafts.drafts,
      draftDo: cotacaoDrafts.draftDo,
      draftToOpcoes: cotacaoDrafts.draftToOpcoes,
      parseTaxa: cotacaoDrafts.parseTaxa,
      readonly: () => false,
      cancelarAutoSave: () => {},
      salvarTaxas: () => {},
      escolherBanco: () => new Promise<boolean>((resolve) => (resolver = resolve)),
      escolherBancoRendimento: async () => true,
    });

    expect(escolhaBanco.podeEscolher(lotes[0]!, "XP")).toBe(true);
    const promessa = escolhaBanco.escolher("L1", "XP");
    expect(escolhaBanco.podeEscolher(lotes[0]!, "XP")).toBe(false);

    resolver(true);
    await promessa;
    expect(escolhaBanco.podeEscolher(lotes[0]!, "XP")).toBe(true);
  });
});
