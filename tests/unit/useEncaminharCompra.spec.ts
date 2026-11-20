import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import type { Compra, CorpoEncaminhar, OrdemEncaminhada, PreviaEncaminhar, RespostaEncaminhar } from "../../shared/types/compra";
import { ApiError } from "../../app/utils/apiFetch";
import { DEBOUNCE_PREVIA_MS, useEncaminharCompra, type ApiEncaminhar } from "../../app/composables/useEncaminharCompra";
import { MENSAGEM_FALHA_ENCAMINHAR, chaveConfirmacao } from "../../app/utils/comprasEncaminhar";
import { compraTeste, linhaPrevia, ordemTeste, previaTeste } from "./helpers/encaminharFixtures";

// useEncaminharCompra: prévia com debounce, flush antes de abrir e de enviar, nunca dois POST juntos, cada código de erro, já encaminhada,
// temperatura mista e repetir depois de uma falha de rede. Timers falsos e API simulada (sem rede). Dados fictícios (TESTE).

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const avancar = async (ms: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
  await nextTick();
};

function erroApi(status: number, code: string | null, data: Record<string, unknown> = {}, mensagem = "Erro do servidor."): ApiError {
  return new ApiError(mensagem, status, code === null ? data : { code, ...data });
}

interface Cenario {
  compra: ReturnType<typeof ref<Compra | null>>;
  api: ApiEncaminhar;
  previa: ReturnType<typeof vi.fn>;
  encaminhar: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  aplicarCompra: ReturnType<typeof vi.fn>;
  sinalizarConflito: ReturnType<typeof vi.fn>;
  aoEncaminhar: ReturnType<typeof vi.fn>;
  avisar: ReturnType<typeof vi.fn>;
  pendente: { valor: boolean };
  /** Muda a versão da compra (um autosave que passou). */
  salvouVersao: (v: string) => void;
  respostaPrevia: { atual: PreviaEncaminhar };
  respostaEncaminhar: { atual: () => Promise<RespostaEncaminhar> };
}

function cenario(compraInicial: Compra = compraTeste()): Cenario {
  const compra = ref<Compra | null>(compraInicial);
  const respostaPrevia = { atual: previaTeste(compraInicial) };
  const previa = vi.fn(async (): Promise<PreviaEncaminhar> => respostaPrevia.atual);
  const respostaEncaminhar = {
    atual: async (): Promise<RespostaEncaminhar> => ({
      compra: { ...compra.value!, updatedAt: "2026-12-01T12:05:00.000Z", ordens: compra.value!.ordens.map((o) => ({ ...o, dirId: `dir_${o.id}`, encaminhadaEm: "2026-12-01T12:05:00.000Z" })) },
      criadas: compra.value!.ordens.map((o) => ({ ordemId: o.id, dirId: `dir_${o.id}`, po: o.po })),
      jaEncaminhada: false,
    }),
  };
  const encaminhar = vi.fn((_id: string, _corpo: CorpoEncaminhar) => respostaEncaminhar.atual());
  const flush = vi.fn(async () => true);
  const aplicarCompra = vi.fn((c: Compra) => {
    compra.value = c;
  });
  return {
    compra,
    api: { previa, encaminhar },
    previa,
    encaminhar,
    flush,
    aplicarCompra,
    sinalizarConflito: vi.fn(),
    aoEncaminhar: vi.fn(),
    avisar: vi.fn(),
    pendente: { valor: false },
    salvouVersao: (v) => {
      compra.value = { ...compra.value!, updatedAt: v };
    },
    respostaPrevia,
    respostaEncaminhar,
  };
}

function usar(c: Cenario) {
  return useEncaminharCompra({
    compra: () => c.compra.value,
    flush: c.flush,
    pendente: () => c.pendente.valor,
    aplicarCompra: c.aplicarCompra,
    sinalizarConflito: c.sinalizarConflito,
    aoEncaminhar: c.aoEncaminhar,
    avisar: c.avisar,
    api: c.api,
  });
}

/** Abre o painel e deixa a prévia chegar. */
async function aberto(c: Cenario) {
  const e = usar(c);
  await e.abrir();
  await avancar(0);
  return e;
}

describe("abrir o painel", () => {
  it("descarrega o salvamento ANTES de abrir e busca a prévia da compra", async () => {
    const c = cenario();
    const ordem: string[] = [];
    c.flush.mockImplementation(async () => {
      ordem.push("flush");
      return true;
    });
    c.previa.mockImplementation(async () => {
      ordem.push("previa");
      return c.respostaPrevia.atual;
    });
    const e = usar(c);
    expect(await e.abrir()).toBe(true);
    expect(ordem).toEqual(["flush", "previa"]);
    expect(c.previa).toHaveBeenCalledWith("cmp_teste_000001");
    expect(e.aberto.value).toBe(true);
    expect(e.painel.value.previa).not.toBeNull();
  });

  it("se o salvamento falhar NÃO abre, avisa e não busca a prévia", async () => {
    const c = cenario();
    c.flush.mockResolvedValue(false);
    const e = usar(c);
    expect(await e.abrir()).toBe(false);
    expect(e.aberto.value).toBe(false);
    expect(c.previa).not.toHaveBeenCalled();
    expect(c.avisar).toHaveBeenCalledTimes(1);
    expect(c.avisar.mock.calls[0]![0]).toContain("Salve de novo antes de encaminhar");
  });

  it("'Carregando…' só na primeira busca (carregando, sem prévia ainda)", async () => {
    const c = cenario();
    let soltar: (p: PreviaEncaminhar) => void = () => undefined;
    c.previa.mockImplementation(() => new Promise<PreviaEncaminhar>((r) => (soltar = r)));
    const e = usar(c);
    const abrindo = e.abrir();
    await avancar(0);
    expect(e.painel.value).toMatchObject({ aberto: true, carregando: true, previa: null, podeEnviar: false, motivoBloqueio: "Carregando a conferência…" });
    soltar(previaTeste(c.compra.value!));
    await abrindo;
    await avancar(0);
    expect(e.painel.value.carregando).toBe(false);
    expect(e.painel.value.previa).not.toBeNull();
  });

  it("sem compra aberta, não abre", async () => {
    const c = cenario();
    c.compra.value = null;
    expect(await usar(c).abrir()).toBe(false);
  });

  it("fechar zera tudo; reabrir busca de novo", async () => {
    const c = cenario();
    const e = await aberto(c);
    e.fechar();
    expect(e.painel.value).toMatchObject({ aberto: false, previa: null, resultado: null, erroEnvio: null, confirmadas: [] });
    await e.abrir();
    await avancar(0);
    expect(c.previa).toHaveBeenCalledTimes(2);
  });

  it("trocar de compra fecha o painel", async () => {
    const c = cenario();
    const e = await aberto(c);
    c.compra.value = compraTeste({ id: "cmp_teste_000002" });
    await nextTick();
    expect(e.aberto.value).toBe(false);
  });
});

describe("a prévia acompanha o que foi salvo (debounce)", () => {
  it("uma versão nova só busca depois de DEBOUNCE_PREVIA_MS; várias seguidas viram UMA busca", async () => {
    const c = cenario();
    await aberto(c);
    expect(DEBOUNCE_PREVIA_MS).toBe(400);
    c.previa.mockClear();
    c.salvouVersao("2026-12-01T12:01:00.000Z");
    await nextTick();
    await avancar(399);
    expect(c.previa).not.toHaveBeenCalled();
    c.salvouVersao("2026-12-01T12:02:00.000Z"); // outro autosave dentro da janela: reinicia a espera
    await nextTick();
    await avancar(399);
    expect(c.previa).not.toHaveBeenCalled();
    await avancar(1);
    expect(c.previa).toHaveBeenCalledTimes(1);
  });

  it("com o painel FECHADO, uma versão nova não busca nada", async () => {
    const c = cenario();
    usar(c);
    c.salvouVersao("2026-12-01T12:01:00.000Z");
    await nextTick();
    await avancar(2000);
    expect(c.previa).not.toHaveBeenCalled();
  });

  it("a última prévia FICA na tela enquanto a nova carrega (sem piscar), marcada como 'atualizando'", async () => {
    const c = cenario();
    const e = await aberto(c);
    const antiga = e.painel.value.previa;
    let soltar: (p: PreviaEncaminhar) => void = () => undefined;
    c.previa.mockImplementation(() => new Promise<PreviaEncaminhar>((r) => (soltar = r)));
    c.salvouVersao("2026-12-01T12:01:00.000Z");
    await nextTick();
    await avancar(400);
    expect(e.painel.value.previa).toBe(antiga);
    expect(e.painel.value.carregando).toBe(false);
    expect(e.painel.value.atualizando).toBe(true);
    expect(e.painel.value.podeEnviar).toBe(false); // não envia com base numa prévia velha
    const nova = previaTeste(c.compra.value!, { conflitosPo: ["PO26-12-9998"] });
    soltar(nova);
    await avancar(0);
    expect(e.painel.value.previa).toEqual(nova);
    expect(e.painel.value.atualizando).toBe(false);
  });

  it("resposta de uma busca SUPERADA é descartada (a mais nova vale)", async () => {
    const c = cenario();
    const e = await aberto(c);
    const soltar: Array<(p: PreviaEncaminhar) => void> = [];
    c.previa.mockImplementation(() => new Promise<PreviaEncaminhar>((r) => soltar.push(r)));
    void e.recarregarPrevia();
    void e.recarregarPrevia();
    await avancar(0);
    expect(soltar).toHaveLength(2);
    const velha = previaTeste(c.compra.value!, { conflitosPo: ["PO26-12-0001"] });
    const nova = previaTeste(c.compra.value!, { conflitosPo: ["PO26-12-0002"] });
    soltar[1]!(nova);
    await avancar(0);
    soltar[0]!(velha);
    await avancar(0);
    expect(e.painel.value.previa).toEqual(nova);
  });

  it("a prévia falhou: mostra o erro, não envia, e 'tentar de novo' busca de novo", async () => {
    const c = cenario();
    c.previa.mockRejectedValueOnce(new ApiError("Falha ao ler.", 500));
    const e = usar(c);
    await e.abrir();
    await avancar(0);
    expect(e.painel.value).toMatchObject({ erroPrevia: "Falha ao ler.", podeEnviar: false, carregando: false });
    await e.recarregarPrevia();
    expect(e.painel.value).toMatchObject({ erroPrevia: null, podeEnviar: true });
  });

  it("erro de rede ao buscar a prévia também vira mensagem", async () => {
    const c = cenario();
    c.previa.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const e = usar(c);
    await e.abrir();
    expect(e.painel.value.erroPrevia).toBe("Não foi possível carregar a conferência. Tente de novo.");
  });

  it("expõe os POs que já existem na DIR (para o checklist normal) só com o painel aberto", async () => {
    const c = cenario();
    c.respostaPrevia.atual = previaTeste(c.compra.value!, { conflitosPo: ["PO26-12-9998"] });
    const e = usar(c);
    expect(e.conflitosPo.value).toEqual([]);
    await e.abrir();
    expect(e.conflitosPo.value).toEqual(["PO26-12-9998"]);
    e.fechar();
    expect(e.conflitosPo.value).toEqual([]);
  });
});

describe("pode enviar?", () => {
  it("prévia sem impedimento: sim; com erro, conflito de PO, PO repetido ou vendedor inativo: não, com o motivo", async () => {
    const base = compraTeste();
    const casos: Array<[string, Partial<PreviaEncaminhar>]> = [
      ["erro da checagem", { erros: [{ id: "paciente", nivel: "erro", texto: "Paciente não preenchido" }] }],
      ["PO na DIR", { conflitosPo: ["PO26-12-9998"] }],
      ["PO repetido", { posRepetidosNaCompra: ["PO26-12-9998"] }],
      ["vendedor inativo", { vendedorInativo: true }],
    ];
    const c0 = cenario(base);
    expect((await aberto(c0)).painel.value).toMatchObject({ podeEnviar: true, motivoBloqueio: null });
    for (const [nome, extra] of casos) {
      const c = cenario(base);
      c.respostaPrevia.atual = previaTeste(base, extra);
      const e = await aberto(c);
      expect(e.painel.value.podeEnviar, nome).toBe(false);
      expect(e.painel.value.motivoBloqueio, nome).toBe("Resolva os itens em vermelho para encaminhar.");
    }
  });

  it("todas as ordens já encaminhadas: não envia ('Todas as ordens já foram encaminhadas.')", async () => {
    const base = compraTeste({ ordens: [ordemTeste(1, { dirId: "dir_ord_teste_0001", encaminhadaEm: "2026-12-01T12:00:00.000Z" })] });
    const c = cenario(base);
    const e = await aberto(c);
    expect(e.painel.value).toMatchObject({ linhasPendentes: 0, podeEnviar: false, motivoBloqueio: "Todas as ordens já foram encaminhadas." });
  });

  it("alterações ainda não salvas seguram o Encaminhar", async () => {
    const c = cenario();
    const e = await aberto(c);
    c.pendente.valor = true;
    expect(e.painel.value).toMatchObject({ podeEnviar: false, motivoBloqueio: "Salvando as alterações da compra…" });
  });

  it("conta só as ordens ainda sem dir_id", async () => {
    const base = compraTeste({ ordens: [ordemTeste(1, { dirId: "dir_ord_teste_0001", encaminhadaEm: "2026-12-01T12:00:00.000Z" }), ordemTeste(2)] });
    const e = await aberto(cenario(base));
    expect(e.painel.value.linhasPendentes).toBe(1);
  });
});

describe("enviar (POST)", () => {
  it("manda { atualizadoEm } da versão atual, SEM ordemIds e SEM confirmarTemperaturaMista quando nada é misto", async () => {
    const c = cenario();
    const e = await aberto(c);
    await e.enviar();
    expect(c.encaminhar).toHaveBeenCalledTimes(1);
    expect(c.encaminhar.mock.calls[0]).toEqual(["cmp_teste_000001", { atualizadoEm: "2026-12-01T12:00:00.000Z" }]);
    expect(Object.keys(c.encaminhar.mock.calls[0]![1] as object)).toEqual(["atualizadoEm"]);
  });

  it("descarrega o salvamento antes de enviar; se o salvamento falhar NÃO envia e mostra o erro", async () => {
    const c = cenario();
    const e = await aberto(c);
    c.flush.mockClear();
    c.flush.mockResolvedValueOnce(false);
    await e.enviar();
    expect(c.flush).toHaveBeenCalledTimes(1);
    expect(c.encaminhar).not.toHaveBeenCalled();
    expect(e.painel.value.erroEnvio?.mensagem).toContain("Salve de novo antes de encaminhar");
    expect(e.painel.value.podeEnviar).toBe(true); // dá para tentar de novo
  });

  it("o flush salvou algo (a versão mudou depois da prévia): NÃO envia e atualiza a prévia", async () => {
    const c = cenario();
    const e = await aberto(c);
    c.flush.mockImplementationOnce(async () => {
      c.salvouVersao("2026-12-01T12:03:00.000Z");
      return true;
    });
    c.previa.mockClear();
    await e.enviar();
    expect(c.encaminhar).not.toHaveBeenCalled();
    expect(e.painel.value.erroEnvio?.mensagem).toContain("A compra mudou");
    expect(c.previa).toHaveBeenCalledTimes(1);
  });

  it("NUNCA dois POST ao mesmo tempo: o 2º clique durante o envio não faz nada", async () => {
    const c = cenario();
    const e = await aberto(c);
    let soltar: (r: RespostaEncaminhar) => void = () => undefined;
    c.encaminhar.mockImplementation(() => new Promise<RespostaEncaminhar>((r) => (soltar = r)));
    const um = e.enviar();
    const dois = e.enviar();
    await avancar(0);
    expect(c.encaminhar).toHaveBeenCalledTimes(1);
    expect(e.painel.value).toMatchObject({ enviando: true, podeEnviar: false });
    soltar({ compra: c.compra.value!, criadas: [], jaEncaminhada: true });
    await Promise.all([um, dois]);
    expect(c.encaminhar).toHaveBeenCalledTimes(1);
  });

  it("sucesso: troca a compra do editor pela devolvida, avisa com as criadas, mostra o resultado e para de buscar a prévia", async () => {
    const c = cenario();
    const e = await aberto(c);
    await e.enviar();
    expect(c.aplicarCompra).toHaveBeenCalledTimes(1);
    const devolvida = c.aplicarCompra.mock.calls[0]![0] as Compra;
    expect(devolvida.updatedAt).toBe("2026-12-01T12:05:00.000Z");
    expect(devolvida.ordens.every((o) => o.dirId !== null)).toBe(true);
    expect(c.aoEncaminhar).toHaveBeenCalledTimes(1);
    expect((c.aoEncaminhar.mock.calls[0]![0] as OrdemEncaminhada[]).map((x) => x.po)).toEqual(["PO26-12-9998", "PO26-12-9999"]);
    expect(e.painel.value.resultado).toEqual({ tipo: "criadas", criadas: expect.any(Array) });
    c.previa.mockClear();
    await avancar(2000); // a versão nova (aplicada) NÃO dispara outra prévia depois do resultado
    expect(c.previa).not.toHaveBeenCalled();
    expect(e.painel.value.podeEnviar).toBe(false);
  });

  it("jaEncaminhada: mensagem neutra (resultado 'ja-encaminhada'), sem erro e sem avisar criação", async () => {
    const c = cenario();
    c.respostaEncaminhar.atual = async () => ({ compra: c.compra.value!, criadas: [], jaEncaminhada: true });
    const e = await aberto(c);
    await e.enviar();
    expect(e.painel.value.resultado).toEqual({ tipo: "ja-encaminhada" });
    expect(e.painel.value.erroEnvio).toBeNull();
    expect(c.aoEncaminhar).not.toHaveBeenCalled();
    expect(c.aplicarCompra).toHaveBeenCalledTimes(1);
  });
});

describe("temperatura mista exige confirmação", () => {
  function mista(): Cenario {
    const base = compraTeste();
    const c = cenario(base);
    const linhas = [linhaPrevia(base.ordens[0]!, { temperaturaMista: true }, { temperatura: "2°C a 8°C / Ambiente" }), linhaPrevia(base.ordens[1]!)];
    c.respostaPrevia.atual = previaTeste(base, { linhas });
    return c;
  }

  it("sem a confirmação o botão não habilita nem envia; com ela envia com confirmarTemperaturaMista:true", async () => {
    const c = mista();
    const e = await aberto(c);
    const linha = c.respostaPrevia.atual.linhas[0]!;
    expect(e.painel.value).toMatchObject({ podeEnviar: false, motivoBloqueio: "Confirme a temperatura das linhas marcadas." });
    await e.enviar();
    expect(c.encaminhar).not.toHaveBeenCalled();

    e.confirmar(chaveConfirmacao(linha), true);
    expect(e.painel.value.podeEnviar).toBe(true);
    await e.enviar();
    expect(c.encaminhar.mock.calls[0]![1]).toEqual({ atualizadoEm: "2026-12-01T12:00:00.000Z", confirmarTemperaturaMista: true });
  });

  it("desmarcar a caixa volta a bloquear", async () => {
    const c = mista();
    const e = await aberto(c);
    const chave = chaveConfirmacao(c.respostaPrevia.atual.linhas[0]!);
    e.confirmar(chave, true);
    e.confirmar(chave, false);
    expect(e.painel.value.podeEnviar).toBe(false);
  });

  it("duas linhas mistas: só habilita com AS DUAS confirmadas", async () => {
    const base = compraTeste();
    const c = cenario(base);
    c.respostaPrevia.atual = previaTeste(base, { linhas: base.ordens.map((o) => linhaPrevia(o, { temperaturaMista: true }, { temperatura: "2°C a 8°C / Ambiente" })) });
    const e = await aberto(c);
    e.confirmar(chaveConfirmacao(c.respostaPrevia.atual.linhas[0]!), true);
    expect(e.painel.value.podeEnviar).toBe(false);
    e.confirmar(chaveConfirmacao(c.respostaPrevia.atual.linhas[1]!), true);
    expect(e.painel.value.podeEnviar).toBe(true);
  });

  it("a temperatura da linha MUDOU depois da confirmação: a confirmação cai e é pedida de novo", async () => {
    const c = mista();
    const e = await aberto(c);
    e.confirmar(chaveConfirmacao(c.respostaPrevia.atual.linhas[0]!), true);
    expect(e.painel.value.podeEnviar).toBe(true);
    c.respostaPrevia.atual = previaTeste(c.compra.value!, { linhas: [linhaPrevia(c.compra.value!.ordens[0]!, { temperaturaMista: true }, { temperatura: "Ambiente / Abaixo de 30C" }), linhaPrevia(c.compra.value!.ordens[1]!)] });
    await e.recarregarPrevia();
    expect(e.painel.value.confirmadas).toEqual([]);
    expect(e.painel.value.podeEnviar).toBe(false);
  });

  it("sem linha mista a chave de confirmação não vai no corpo", async () => {
    const c = cenario();
    const e = await aberto(c);
    await e.enviar();
    expect(c.encaminhar.mock.calls[0]![1]).not.toHaveProperty("confirmarTemperaturaMista");
  });
});

describe("erros do POST, cada código", () => {
  async function comErro(erro: unknown) {
    const c = cenario();
    const e = await aberto(c);
    c.encaminhar.mockRejectedValueOnce(erro);
    c.previa.mockClear();
    await e.enviar();
    await avancar(0);
    return { c, e };
  }

  it("409 de versão (sem code): abre a faixa de conflito do editor e bloqueia até carregar a versão salva", async () => {
    const { c, e } = await comErro(erroApi(409, null, { atual: compraTeste() }, "Esta compra foi alterada por outra pessoa. Recarregue para ver a versão atual."));
    expect(c.sinalizarConflito).toHaveBeenCalledTimes(1);
    expect(e.painel.value.erroEnvio).toMatchObject({ codigo: "versao", bloqueia: true });
    expect(e.painel.value).toMatchObject({ podeEnviar: false, motivoBloqueio: "Carregue a versão salva da compra para continuar." });
  });

  it("depois do conflito, a versão salva carregada (versão nova) limpa o erro e busca a prévia", async () => {
    const { c, e } = await comErro(erroApi(409, null));
    c.salvouVersao("2026-12-01T12:10:00.000Z");
    await nextTick();
    await avancar(400);
    expect(e.painel.value.erroEnvio).toBeNull();
    expect(c.previa).toHaveBeenCalledTimes(1);
  });

  it("compra_cancelada: aplica a compra atual (cancelada) e bloqueia", async () => {
    const cancelada = compraTeste({ cancelada: true });
    const { c, e } = await comErro(erroApi(409, "compra_cancelada", { atual: cancelada }));
    expect(c.aplicarCompra).toHaveBeenCalledWith(cancelada);
    expect(e.painel.value.erroEnvio).toMatchObject({ codigo: "compra_cancelada", bloqueia: true });
  });

  it("po_ja_na_dir: mensagem com os POs e prévia atualizada", async () => {
    const { c, e } = await comErro(erroApi(409, "po_ja_na_dir", { pos: ["PO26-12-9998", "PO26-12-9999"] }));
    expect(e.painel.value.erroEnvio).toMatchObject({ codigo: "po_ja_na_dir", mensagem: "PO já existe na DIR: PO26-12-9998, PO26-12-9999", bloqueia: false });
    expect(c.previa).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["checklist_com_erros", {}, "A compra ainda tem pendências. Resolva os itens em vermelho e tente de novo."],
    ["vendedor_inativo", {}, "Escolha um consultor ativo para o vendedor desta compra"],
    ["po_repetido_na_compra", { pos: ["PO26-12-9998"] }, "PO repetido nas ordens desta compra: PO26-12-9998"],
    ["temperatura_mista_nao_confirmada", { ordens: [1] }, "Confirme a temperatura das linhas marcadas e tente de novo."],
  ])("422 %s: mensagem em português e prévia atualizada", async (code, data, mensagem) => {
    const { c, e } = await comErro(erroApi(422, code, data as Record<string, unknown>));
    expect(e.painel.value.erroEnvio).toMatchObject({ codigo: code, mensagem, bloqueia: false });
    expect(c.previa).toHaveBeenCalledTimes(1);
  });

  it("400/403/404 sem code: mostra a mensagem do servidor", async () => {
    const { e } = await comErro(erroApi(403, null, {}, "Sem permissão."));
    expect(e.painel.value.erroEnvio).toMatchObject({ mensagem: "Sem permissão.", bloqueia: false });
  });

  it("500: 'Nada foi criado ou pode ter sido criado parcialmente: tente de novo (repetir é seguro)'", async () => {
    const { e } = await comErro(erroApi(500, null, {}, "Server Error"));
    expect(e.painel.value.erroEnvio).toMatchObject({ codigo: null, mensagem: MENSAGEM_FALHA_ENCAMINHAR, bloqueia: false });
    expect(MENSAGEM_FALHA_ENCAMINHAR).toBe("Não foi possível encaminhar. Nada foi criado ou pode ter sido criado parcialmente: tente de novo (repetir é seguro).");
  });

  it("erro de rede: a mesma mensagem, o botão continua disponível e REPETIR envia de novo (o servidor é idempotente)", async () => {
    const { c, e } = await comErro(new TypeError("Failed to fetch"));
    expect(e.painel.value.erroEnvio?.mensagem).toBe(MENSAGEM_FALHA_ENCAMINHAR);
    expect(e.painel.value.podeEnviar).toBe(true);
    await e.enviar();
    expect(c.encaminhar).toHaveBeenCalledTimes(2);
    expect(e.painel.value.resultado).toEqual({ tipo: "criadas", criadas: expect.any(Array) });
    expect(e.painel.value.erroEnvio).toBeNull();
  });
});
