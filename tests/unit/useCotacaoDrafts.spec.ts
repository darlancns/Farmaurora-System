import { describe, expect, it } from "vitest";
import type { LoteBanco, OpcaoCotacao } from "#shared/types/Pagamento";
import { useCotacaoDrafts } from "../../app/composables/useCotacaoDrafts";

// Caracterização de reconciliarDrafts (Round 9) — merge de 3 vias entre
// rascunho local, último snapshot conhecido do servidor e o dado novo que
// acabou de chegar. Comportamento ATUAL, sem corrigir nada — achados
// suspeitos vão no relatório da extração, não aqui.
//
// `lotes` é passado como getter sobre uma variável simples (não um `ref`/
// `reactive` do Vue) de propósito: assim o watch interno do composable roda
// só uma vez (immediate, no setup) e nunca mais dispara sozinho, porque não
// há nada reativo pra rastrear. Isso deixa o teste determinístico — cada
// chamada de `reconciliarDrafts()` só acontece quando o teste chama
// explicitamente, sem depender do agendamento assíncrono (nextTick) do
// watcher real que roda em produção sobre `props.lotes`.

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

describe("useCotacaoDrafts / reconciliarDrafts", () => {
  it("caminho comum: sem edição local, o novo valor do servidor substitui o rascunho", () => {
    let currentLotes: LoteBanco[] = [lote("L1", [opcao("XP", 5)])];
    const { drafts, reconciliarDrafts } = useCotacaoDrafts({ lotes: () => currentLotes });

    // immediate: true já rodou reconciliarDrafts uma vez no setup, criando o
    // rascunho a partir do primeiro valor do servidor.
    expect(drafts["L1"]?.find((d) => d.banco === "XP")?.taxaStr).toBe("5");

    // Servidor manda um valor novo, usuário não mexeu em nada.
    currentLotes = [lote("L1", [opcao("XP", 6)])];
    reconciliarDrafts();

    expect(drafts["L1"]?.find((d) => d.banco === "XP")?.taxaStr).toBe("6");
  });

  it("concorrência: edição local pendente é preservada mesmo com dado novo do servidor chegando junto", () => {
    let currentLotes: LoteBanco[] = [lote("L1", [opcao("XP", 5)])];
    const { drafts, reconciliarDrafts } = useCotacaoDrafts({ lotes: () => currentLotes });

    // Usuário edita o campo — o rascunho passa a divergir do último snapshot
    // conhecido (5) ANTES do próximo refetch chegar.
    const draft = drafts["L1"]!.find((d) => d.banco === "XP")!;
    draft.taxaStr = "7,5";

    // Ao mesmo tempo, um valor novo (e diferente tanto do snapshot antigo
    // quanto da edição local) chega do servidor.
    currentLotes = [lote("L1", [opcao("XP", 6)])];
    reconciliarDrafts();

    // A edição do usuário vence — não é sobrescrita pelo valor do servidor.
    expect(draft.taxaStr).toBe("7,5");
  });

  it("múltiplos refetches em sequência sem edição do usuário: cada um adota o valor novo do servidor", () => {
    let currentLotes: LoteBanco[] = [lote("L1", [opcao("XP", 1)])];
    const { drafts, reconciliarDrafts } = useCotacaoDrafts({ lotes: () => currentLotes });
    const draft = () => drafts["L1"]!.find((d) => d.banco === "XP")!;

    expect(draft().taxaStr).toBe("1");

    currentLotes = [lote("L1", [opcao("XP", 2)])];
    reconciliarDrafts();
    expect(draft().taxaStr).toBe("2");

    currentLotes = [lote("L1", [opcao("XP", 3)])];
    reconciliarDrafts();
    expect(draft().taxaStr).toBe("3");
  });

  it("lote novo (ainda sem rascunho) é inicializado direto a partir do servidor", () => {
    let currentLotes: LoteBanco[] = [];
    const { drafts, reconciliarDrafts } = useCotacaoDrafts({ lotes: () => currentLotes });

    expect(drafts["L2"]).toBeUndefined();

    currentLotes = [lote("L2", [opcao("XP", 9)])];
    reconciliarDrafts();

    expect(drafts["L2"]?.find((d) => d.banco === "XP")?.taxaStr).toBe("9");
  });

  it("concorrência na corretagem: mesmo comportamento de preservar a edição local", () => {
    let currentLotes: LoteBanco[] = [lote("L1", [opcao("XP", 5, 10)])];
    const { drafts, reconciliarDrafts } = useCotacaoDrafts({ lotes: () => currentLotes });
    const draft = drafts["L1"]!.find((d) => d.banco === "XP")!;

    expect(draft.corretagemStr).toBe("10");

    draft.corretagemStr = "25";
    currentLotes = [lote("L1", [opcao("XP", 5, 15)])];
    reconciliarDrafts();

    expect(draft.corretagemStr).toBe("25");
  });

  it("draftDo devolve rascunho vazio (não undefined) pra lote/banco ainda não sincronizado", () => {
    const { draftDo } = useCotacaoDrafts({ lotes: () => [] });
    expect(draftDo("inexistente", "XP")).toEqual({ banco: "XP", taxaStr: "", corretagemStr: "" });
  });

  it("draftToOpcoes converte o rascunho de volta pro shape de AtualizarCotacaoDTO", () => {
    const currentLotes: LoteBanco[] = [lote("L1", [opcao("XP", 5, 10)])];
    const { draftToOpcoes } = useCotacaoDrafts({ lotes: () => currentLotes });

    expect(draftToOpcoes("L1")).toEqual([{ banco: "XP", taxa: 5, taxaCorretagem: 10 }]);
  });
});
