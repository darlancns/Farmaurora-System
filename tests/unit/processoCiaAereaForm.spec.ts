import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";
import type { Processo } from "#shared/types/processo";
import { useProcessoForm } from "../../app/composables/useProcessoForm";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { linhaCompleta } from "./helpers/processoEdicaoFixtures";

// Item 6 do lote Follow-Up — formulário: "Cia. aérea" depende do "Modal". Composable real (useProcessoForm),
// com o mesmo patch diferencial usado ao salvar.

const AVISO = "Cia. aérea limpa: não pertence a este modal.";

const processoDe = (modal: string | null, cia: string | null, extra: Record<string, unknown> = {}): Processo =>
  montarProcesso(linhaCompleta({ modal_envio: modal, companhia_aerea: cia, ...extra }) as unknown as FollowUpRow);

function patchDe(f: ReturnType<typeof useProcessoForm>) {
  const r = f.validarEdicao();
  if (!r.valido) throw new Error(r.erro);
  return r.patch;
}

describe("select de cia aérea: estado e opções", () => {
  it("sem modal escolhido: desabilitado, só com o texto 'Escolha o modal primeiro'", () => {
    const f = useProcessoForm(() => null);
    expect(f.ciaAereaDesabilitada.value).toBe(true);
    expect(f.ciaAereaOptions.value).toEqual([{ value: "", label: "Escolha o modal primeiro" }]);
  });

  it("opções por modal: Air Cargo, Courier Formal e Courier Simples", () => {
    const f = useProcessoForm(() => null);

    f.onModalEnvioChange("Air Cargo");
    expect(f.ciaAereaDesabilitada.value).toBe(false);
    expect(f.ciaAereaOptions.value.map((o) => o.value)).toEqual(["", "Emirates", "Lufthansa", "Qatar", "Swiss", "Turkish"]);
    expect(f.ciaAereaOptions.value[0]!.label).toBe("Selecione");

    f.onModalEnvioChange("Courier Formal");
    expect(f.ciaAereaOptions.value.map((o) => o.value)).toEqual(["", "DHL", "FedEx"]);

    f.onModalEnvioChange("Courier Simples");
    expect(f.ciaAereaOptions.value.map((o) => o.value)).toEqual(["", "DHL", "FedEx"]);
  });

  it("limpar o modal volta a desabilitar o select", () => {
    const f = useProcessoForm(() => null);
    f.onModalEnvioChange("Air Cargo");
    f.onModalEnvioChange("");
    expect(f.ciaAereaDesabilitada.value).toBe(true);
  });

  it("processo carregado com modal: select habilitado, cia atual selecionada, sem aviso", () => {
    const f = useProcessoForm(() => processoDe("Air Cargo", "Qatar"));
    expect(f.ciaAereaDesabilitada.value).toBe(false);
    expect(f.form.companhiaAerea).toBe("Qatar");
    expect(f.ciaAereaOptions.value.some((o) => o.label.includes("fora da lista"))).toBe(false);
    expect(f.ciaAereaAviso.value).toBe("");
  });
});

describe("trocar o modal", () => {
  it("cia incompatível é limpa (null no patch) e aparece o aviso", () => {
    const f = useProcessoForm(() => processoDe("Air Cargo", "Lufthansa"));

    f.onModalEnvioChange("Courier Formal");

    expect(f.form.modalEnvio).toBe("Courier Formal");
    expect(f.form.companhiaAerea).toBe("");
    expect(f.ciaAereaAviso.value).toBe(AVISO);
    expect(patchDe(f)).toEqual({ modalEnvio: "Courier Formal", companhiaAerea: null, parcial: true });
  });

  it("cia compatível é mantida, sem aviso e sem entrar no patch", () => {
    const f = useProcessoForm(() => processoDe("Courier Formal", "FedEx"));

    f.onModalEnvioChange("Courier Simples");

    expect(f.form.companhiaAerea).toBe("FedEx");
    expect(f.ciaAereaAviso.value).toBe("");
    expect(patchDe(f)).toEqual({ modalEnvio: "Courier Simples", parcial: true });
  });

  it("modal esvaziado: a cia preenchida é limpa (cia sem modal não existe)", () => {
    const f = useProcessoForm(() => processoDe("Air Cargo", "Swiss"));

    f.onModalEnvioChange("");

    expect(f.form.companhiaAerea).toBe("");
    expect(f.ciaAereaAviso.value).toBe(AVISO);
    expect(patchDe(f)).toEqual({ modalEnvio: null, companhiaAerea: null, parcial: true });
  });

  it("sem cia nenhuma: trocar o modal não mostra aviso", () => {
    const f = useProcessoForm(() => processoDe("Air Cargo", null));
    f.onModalEnvioChange("Courier Formal");
    expect(f.ciaAereaAviso.value).toBe("");
    expect(patchDe(f)).toEqual({ modalEnvio: "Courier Formal", parcial: true });
  });

  it("o aviso some quando o usuário escolhe outra cia", () => {
    const f = useProcessoForm(() => processoDe("Air Cargo", "Lufthansa"));
    f.onModalEnvioChange("Courier Formal");
    expect(f.ciaAereaAviso.value).toBe(AVISO);

    f.onCiaAereaChange("DHL");

    expect(f.ciaAereaAviso.value).toBe("");
    expect(patchDe(f)).toEqual({ modalEnvio: "Courier Formal", companhiaAerea: "DHL", parcial: true });
  });

  it("o aviso some ao carregar outro processo / fechar o formulário (reset)", async () => {
    const alvo = ref<Processo | null>(processoDe("Air Cargo", "Lufthansa"));
    const f = useProcessoForm(() => alvo.value);
    f.onModalEnvioChange("Courier Formal");
    expect(f.ciaAereaAviso.value).toBe(AVISO);

    alvo.value = processoDe("Air Cargo", "Qatar", { id: "proc_2" });
    await nextTick();
    expect(f.ciaAereaAviso.value).toBe("");

    f.onModalEnvioChange("Courier Formal");
    expect(f.ciaAereaAviso.value).toBe(AVISO);
    alvo.value = null;
    await nextTick();
    expect(f.ciaAereaAviso.value).toBe("");
  });

  it("carregar o processo não dispara o aviso (só a troca feita pelo usuário)", () => {
    const f = useProcessoForm(() => processoDe("Courier Formal", "Swiss"));
    expect(f.ciaAereaAviso.value).toBe("");
    expect(f.form.companhiaAerea).toBe("Swiss");
  });
});

describe("valor antigo fora da lista", () => {
  it("Courier Formal + Swiss: aparece como opção extra selecionada, é mantido e não vai no patch", () => {
    const f = useProcessoForm(() => processoDe("Courier Formal", "Swiss"));

    expect(f.ciaAereaOptions.value).toContainEqual({ value: "Swiss", label: "Swiss (fora da lista)" });
    expect(f.form.companhiaAerea).toBe("Swiss");
    expect(f.ciaAereaDesabilitada.value).toBe(false);
    expect(patchDe(f)).toBeNull(); // salvar sem mexer não envia nada

    f.form.localEntrega = "Outro lugar";
    const p = patchDe(f)!;
    expect(p).toEqual({ localEntrega: "Outro lugar", parcial: true });
    expect("companhiaAerea" in p).toBe(false);
    expect("modalEnvio" in p).toBe(false);
  });

  it("'Turkish Cargo' (nome antigo) é tratado igual: fora da lista, mantido e fora do patch", () => {
    const f = useProcessoForm(() => processoDe("Air Cargo", "Turkish Cargo"));

    expect(f.ciaAereaOptions.value.at(-1)).toEqual({ value: "Turkish Cargo", label: "Turkish Cargo (fora da lista)" });
    expect(f.form.companhiaAerea).toBe("Turkish Cargo");
    expect(patchDe(f)).toBeNull();
  });

  it("trocar para um modal onde o valor antigo vale (Swiss → Air Cargo): é mantido, sem aviso", () => {
    const f = useProcessoForm(() => processoDe("Courier Formal", "Swiss"));
    f.onModalEnvioChange("Air Cargo");
    expect(f.form.companhiaAerea).toBe("Swiss");
    expect(f.ciaAereaAviso.value).toBe("");
    expect(patchDe(f)).toEqual({ modalEnvio: "Air Cargo", parcial: true });
  });

  it("trocar para um modal onde o valor antigo não vale: é limpo, com aviso", () => {
    const f = useProcessoForm(() => processoDe("Courier Formal", "Swiss"));
    f.onModalEnvioChange("Courier Simples");
    expect(f.form.companhiaAerea).toBe("");
    expect(f.ciaAereaAviso.value).toBe(AVISO);
    expect(patchDe(f)).toEqual({ modalEnvio: "Courier Simples", companhiaAerea: null, parcial: true });
  });

  it("escolher uma cia da lista no lugar do valor antigo vai no patch e a opção extra some", () => {
    const f = useProcessoForm(() => processoDe("Courier Formal", "Swiss"));
    f.onCiaAereaChange("FedEx");
    expect(patchDe(f)).toEqual({ companhiaAerea: "FedEx", parcial: true });
    expect(f.ciaAereaOptions.value.some((o) => o.label.includes("fora da lista"))).toBe(false);
  });

  it("esvaziar a cia antiga vai como null", () => {
    const f = useProcessoForm(() => processoDe("Courier Formal", "Swiss"));
    f.onCiaAereaChange("");
    expect(patchDe(f)).toEqual({ companhiaAerea: null, parcial: true });
  });

  it("modal legado 'Courier' + cia: a cia continua visível e é mantida", () => {
    const f = useProcessoForm(() => processoDe("Courier", "FedEx"));
    expect(f.ciaAereaOptions.value).toContainEqual({ value: "FedEx", label: "FedEx (fora da lista)" });
    expect(patchDe(f)).toBeNull();
  });
});

describe("criação de processo: mesma lógica", () => {
  function criacaoValida() {
    const f = useProcessoForm(() => null);
    f.form.paciente = "Fulano";
    f.form.pasta = "2026 - 1";
    f.form.consultor = "Dani";
    f.form.despachante = "Marcelo Lima";
    return f;
  }

  it("escolher modal e cia: o payload leva a cia", () => {
    const f = criacaoValida();
    f.onModalEnvioChange("Air Cargo");
    f.onCiaAereaChange("Emirates");

    const r = f.validar();
    if (!r.valido) throw new Error(r.erro);
    expect(r.payload.modalEnvio).toBe("Air Cargo");
    expect(r.payload.companhiaAerea).toBe("Emirates");
  });

  it("trocar o modal depois de escolher a cia: cia incompatível é limpa, com aviso, e não vai no payload", () => {
    const f = criacaoValida();
    f.onModalEnvioChange("Air Cargo");
    f.onCiaAereaChange("Emirates");

    f.onModalEnvioChange("Courier Formal");

    expect(f.ciaAereaAviso.value).toBe(AVISO);
    const r = f.validar();
    if (!r.valido) throw new Error(r.erro);
    expect(r.payload.companhiaAerea).toBeUndefined();
  });

  it("sem modal e sem cia (os dois são opcionais na criação): payload sem cia", () => {
    const f = criacaoValida();
    expect(f.ciaAereaDesabilitada.value).toBe(true);
    const r = f.validar();
    if (!r.valido) throw new Error(r.erro);
    expect(r.payload.companhiaAerea).toBeUndefined();
  });
});
