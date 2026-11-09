// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import DirFormModal from "../../app/components/dir/DirFormModal.vue";
import { useDirForm } from "../../app/composables/useDirForm";
import plugin from "../../app/plugins/primeira-maiuscula.client";
import { aplicarMaiusculasNoCampo } from "../../app/utils/aplicarMaiusculasNoCampo";
import { FILTROS_DIR_VAZIOS, aplicarFiltrosDir } from "../../app/utils/dirFiltros";
import { novoDir } from "./helpers/dirFixtures";

// Medicamento da DIR: tudo em MAIÚSCULAS ao digitar/colar (como o medicamento do Follow-Up). Valor já gravado
// não é convertido (nem na abertura da edição nem ao salvar outros campos), e a busca segue achando por qualquer caixa.
vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-07",
}));

const lerFonte = (caminho: string): string => readFileSync(resolve(process.cwd(), caminho), "utf-8");

function campo(valor: string, cursor: number | null = valor.length) {
  const c = {
    value: valor,
    selectionStart: cursor,
    setSelectionRange(a: number, b: number) {
      c.selectionStart = a;
      void b;
    },
  };
  return c;
}
const comoInput = (c: ReturnType<typeof campo>) => c as unknown as HTMLInputElement;
const evento = (c: ReturnType<typeof campo>) => ({ target: c }) as unknown as Event;

describe("aplicarMaiusculasNoCampo", () => {
  it("digitar e colar: tudo em maiúsculas, com acento, número e símbolo preservados", () => {
    for (const [digitado, esperado] of [
      ["keytruda", "KEYTRUDA"],
      ["Keytruda 100mg", "KEYTRUDA 100MG"],
      ["opdivo (nivolumabe) 40mg/4ml", "OPDIVO (NIVOLUMABE) 40MG/4ML"],
      ["ácido zoledrônico", "ÁCIDO ZOLEDRÔNICO"],
      ["JÁ MAIÚSCULO", "JÁ MAIÚSCULO"],
      ["", ""],
      ["123 -/", "123 -/"],
    ]) {
      const c = campo(digitado);
      expect(aplicarMaiusculasNoCampo(comoInput(c)), digitado).toBe(esperado);
      expect(c.value, digitado).toBe(esperado);
    }
  });

  it("o cursor fica onde estava ao editar no meio (não vai para o fim)", () => {
    const c = campo("KEYTRUdA", 6); // digitou "d" minúsculo no meio
    expect(aplicarMaiusculasNoCampo(comoInput(c))).toBe("KEYTRUDA");
    expect(c.selectionStart).toBe(6);

    const colado = campo("abc DEF", 3);
    aplicarMaiusculasNoCampo(comoInput(colado));
    expect(colado.value).toBe("ABC DEF");
    expect(colado.selectionStart).toBe(3);
  });

  it("'ß' vira 'SS': o cursor acompanha o tamanho do que veio antes", () => {
    const c = campo("straße x", 6); // cursor depois do "e"
    aplicarMaiusculasNoCampo(comoInput(c));
    expect(c.value).toBe("STRASSE X");
    expect(c.selectionStart).toBe(7);
  });

  it("já em maiúsculas: não mexe no campo (nem no cursor)", () => {
    const c = campo("KEYTRUDA", 3);
    c.setSelectionRange = () => {
      throw new Error("não devia mexer na seleção");
    };
    expect(aplicarMaiusculasNoCampo(comoInput(c))).toBe("KEYTRUDA");
    expect(c.selectionStart).toBe(3);
  });

  it("sem seleção (null) ou campo fora do DOM: não quebra", () => {
    const c = campo("abc", null);
    expect(aplicarMaiusculasNoCampo(comoInput(c))).toBe("ABC");
    const fora = {
      value: "abc",
      selectionStart: 1 as number | null,
      setSelectionRange() {
        throw new Error("sem seleção");
      },
    };
    expect(aplicarMaiusculasNoCampo(fora as unknown as HTMLInputElement)).toBe("ABC");
  });
});

describe("useDirForm: onMedicamentoInput", () => {
  it("escreve o texto em maiúsculas no estado e no campo", () => {
    const f = useDirForm(() => null);
    const c = campo("keytruda 100mg");
    f.onMedicamentoInput(evento(c));
    expect(f.form.medicamento).toBe("KEYTRUDA 100MG");
    expect(c.value).toBe("KEYTRUDA 100MG");
  });

  it("o payload leva o medicamento em maiúsculas (e sem espaços nas pontas)", () => {
    const f = useDirForm(() => null);
    f.form.po = "PO26-10-0471";
    f.form.paciente = "Fulano";
    f.outros.vendedor.state.select = "Mateus Morais";
    f.onMedicamentoInput(evento(campo("  opdivo 100mg  ")));
    const r = f.validar();
    expect(r.valido && r.payload.medicamento).toBe("OPDIVO 100MG");
    expect(r.valido && r.atualizacao.medicamento).toBe("OPDIVO 100MG");
  });

  it("edição: o valor antigo (minúsculas) fica como está até mexer no campo — abrir e salvar não converte", () => {
    const antigo = novoDir({ medicamento: "Keytruda 100mg (lote antigo)" });
    const f = useDirForm(() => antigo);
    expect(f.form.medicamento).toBe("Keytruda 100mg (lote antigo)");
    f.form.paciente = "Outro nome"; // mexeu em OUTRO campo
    const r = f.validar();
    expect(r.valido && r.atualizacao.medicamento).toBe("Keytruda 100mg (lote antigo)");
  });

  it("edição: ao mexer no campo, o texto inteiro vira maiúsculas", () => {
    const antigo = novoDir({ medicamento: "Keytruda 100mg" });
    const f = useDirForm(() => antigo);
    f.onMedicamentoInput(evento(campo("Keytruda 100mg x")));
    expect(f.form.medicamento).toBe("KEYTRUDA 100MG X");
  });
});

describe("busca da DIR por medicamento (não mudou)", () => {
  const lista = [
    novoDir({ id: "a", medicamento: "KEYTRUDA 100MG", po: "PO26-10-0001" }),
    novoDir({ id: "b", medicamento: "Keytruda lote antigo", po: "PO26-10-0002" }),
    novoDir({ id: "c", medicamento: "OPDIVO", po: "PO26-10-0003" }),
  ];
  const ids = (busca: string) => aplicarFiltrosDir(lista, { ...FILTROS_DIR_VAZIOS, busca }).map((d) => d.id);

  it("acha em maiúsculas, minúsculas e misto (grava novo em maiúsculas e o antigo continua achável)", () => {
    for (const termo of ["keytruda", "KEYTRUDA", "Keytruda", "kEyTrUdA"]) expect(ids(termo), termo).toEqual(["a", "b"]);
    expect(ids("opdivo")).toEqual(["c"]);
    expect(ids("100mg")).toEqual(["a"]);
  });

  it("a busca continua sem ignorar pontuação no medicamento (só PO e AWB ignoram)", () => {
    const l = [novoDir({ id: "x", medicamento: "ABC-100", po: "PO26-10-0004", awb: "" })];
    expect(aplicarFiltrosDir(l, { ...FILTROS_DIR_VAZIOS, busca: "abc-100" }).map((d) => d.id)).toEqual(["x"]);
    expect(aplicarFiltrosDir(l, { ...FILTROS_DIR_VAZIOS, busca: "abc100" }).map((d) => d.id)).toEqual([]);
  });
});

describe("DirFormModal: a ligação do campo", () => {
  it("o campo df-medicamento liga onMedicamentoInput e não usa v-model (que não mascara)", () => {
    const fonte = lerFonte("app/components/dir/DirFormModal.vue");
    const campoMed = /<input\s[^>]*id="df-medicamento"[^>]*\/>/s.exec(fonte)?.[0] ?? "";
    expect(campoMed).toContain('@input="onMedicamentoInput"');
    expect(campoMed).not.toContain("v-model");
    expect(campoMed).not.toContain("data-sem-maiuscula"); // como o medicamento do Follow-Up: segue a regra global (que a maiúscula total já cobre)
  });
});

// ── Formulário montado, com o plugin global instalado ──────────────────────────────────────────────

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];

function montar(editingDir: ReturnType<typeof novoDir> | null = null): HTMLInputElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({ render: () => h(DirFormModal, { editingDir, contagemPorPo: new Map<string, number>() }) }),
  );
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return document.getElementById("df-medicamento") as HTMLInputElement;
}

function digitar(c: HTMLInputElement, texto: string, cursor = texto.length): void {
  c.value = texto;
  c.setSelectionRange(cursor, cursor);
  c.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

beforeAll(() => {
  (plugin as unknown as () => void)();
});

afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
});

describe("DirFormModal montado: df-medicamento", () => {
  it("digitar e colar viram maiúsculas, mesmo com o plugin da 1ª maiúscula instalado", async () => {
    const med = montar();
    digitar(med, "keytruda 100mg");
    await nextTick();
    expect(med.value).toBe("KEYTRUDA 100MG");
    digitar(med, "opdivo");
    await nextTick();
    expect(med.value).toBe("OPDIVO");
  });

  it("tecla a tecla, o campo nunca fica com letra minúscula", async () => {
    const med = montar();
    let atual = "";
    for (const ch of "ácido zoledrônico 4mg") {
      digitar(med, atual + ch);
      await nextTick();
      atual = med.value;
      expect(atual, atual).toBe(atual.toUpperCase());
    }
    expect(med.value).toBe("ÁCIDO ZOLEDRÔNICO 4MG");
  });

  it("edição: o valor antigo aparece como está; ao mexer, vira maiúsculas; o cursor não pula", async () => {
    const med = montar(novoDir({ medicamento: "Keytruda 100mg" }));
    expect(med.value).toBe("Keytruda 100mg");
    digitar(med, "Keytruda x100mg", 10); // digitou "x" no meio
    await nextTick();
    expect(med.value).toBe("KEYTRUDA X100MG");
    expect(med.selectionStart).toBe(10);
  });
});
