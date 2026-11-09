// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import DirFormModal from "../../app/components/dir/DirFormModal.vue";
import { useDirForm } from "../../app/composables/useDirForm";
import { useProcessoForm } from "../../app/composables/useProcessoForm";
import plugin from "../../app/plugins/primeira-maiuscula.client";
import { aplicarMascaraNumeroPo } from "../../app/utils/aplicarMascaraNumeroPo";
import { NUMERO_PO_ERRO, NUMERO_PO_REGEX } from "#shared/utils/numeroPo";
import { novoDir } from "./helpers/dirFixtures";

// Campo PO da DIR (df-po) com a MESMA máscara do PO do Follow-Up (PO26-10-0471): digitar tecla a tecla, colar, apagar no
// fim e no meio, cursor. A máscara em si (regras) está em numeroPo.spec.ts; aqui: o campo da DIR a usa pela mesma função
// que o Follow-Up (trava) e se comporta igual, no composable e no formulário montado de verdade.
vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-07",
}));

// (no happy-dom o `import.meta.url` não serve de base: o vitest roda da raiz do projeto)
const lerFonte = (caminho: string): string => readFileSync(resolve(process.cwd(), caminho), "utf-8");

// Campo de mentira: guarda valor e seleção como um <input>.
function campo(valor: string, cursor = valor.length) {
  const c = {
    value: valor,
    selectionStart: cursor as number | null,
    setSelectionRange(a: number, b: number) {
      c.selectionStart = a;
      void b;
    },
  };
  return c;
}
type Campo = ReturnType<typeof campo>;
const evento = (c: Campo) => ({ target: c }) as unknown as Event;

// Os dois formulários, cada um com o seu handler e o seu estado do PO.
const dir = () => {
  const f = useDirForm(() => null);
  return { ler: () => f.form.po, escrever: (v: string) => (f.form.po = v), onInput: f.onPoInput, f };
};
const followUp = () => {
  const f = useProcessoForm(() => null);
  return { ler: () => f.form.numeroPo, escrever: (v: string) => (f.form.numeroPo = v), onInput: f.onNumeroPoInput, f };
};
type Formulario = ReturnType<typeof dir>;

function digitar(f: Formulario, texto: string): Campo {
  const c = campo(f.ler());
  for (const ch of texto) {
    const inicio = c.selectionStart ?? c.value.length;
    c.value = c.value.slice(0, inicio) + ch + c.value.slice(inicio);
    c.selectionStart = inicio + 1;
    f.onInput(evento(c));
  }
  return c;
}

function colar(f: Formulario, colado: string): Campo {
  const c = campo(colado);
  f.onInput(evento(c));
  return c;
}

describe("trava: o PO da DIR e o do Follow-Up usam a MESMA função de máscara", () => {
  it("os dois composables importam aplicarMascaraNumeroPo e não têm máscara própria", () => {
    for (const arquivo of ["app/composables/useDirForm.ts", "app/composables/useProcessoForm.ts"]) {
      const fonte = lerFonte(arquivo);
      expect(fonte, arquivo).toMatch(/import \{ aplicarMascaraNumeroPo \} from "\.\.\/utils\/aplicarMascaraNumeroPo"/);
      expect(fonte, `${arquivo}: sem mascararNumeroPo direto`).not.toContain("mascararNumeroPo");
      expect(fonte, `${arquivo}: sem setSelectionRange próprio`).not.toContain("setSelectionRange");
    }
  });

  it("só a função compartilhada fala com mascararNumeroPo e com o cursor do campo", () => {
    const fonte = lerFonte("app/utils/aplicarMascaraNumeroPo.ts");
    expect(fonte).toContain('from "#shared/utils/numeroPo"');
    expect(fonte).toContain("mascararNumeroPo(");
    expect(fonte).toContain("setSelectionRange(");
  });

  it("o campo da DIR liga o handler de máscara e mantém data-sem-maiuscula", () => {
    const fonte = lerFonte("app/components/dir/DirFormModal.vue");
    const campoPo = /<input\s[^>]*id="df-po"[^>]*\/>/s.exec(fonte)?.[0] ?? "";
    expect(campoPo).toContain('@input="onPoInput"');
    expect(campoPo).toContain("data-sem-maiuscula");
  });

  it("mesma resposta, estado e cursor nos dois formulários, para a mesma sequência de teclas e de colagens", () => {
    const sequencias = ["po26100471", "26-10-0471", "po26x10y-0471z", "poab", "po2610047199", "p", "9"];
    for (const texto of sequencias) {
      const a = dir();
      const b = followUp();
      const ca = digitar(a, texto);
      const cb = digitar(b, texto);
      expect(a.ler(), texto).toBe(b.ler());
      expect(ca.value, texto).toBe(cb.value);
      expect(ca.selectionStart, texto).toBe(cb.selectionStart);
      const pa = colar(dir(), texto);
      const pb = colar(followUp(), texto);
      expect(pa.value, `colar ${texto}`).toBe(pb.value);
      expect(pa.selectionStart, `colar ${texto}`).toBe(pb.selectionStart);
    }
  });

  it("a função compartilhada devolve o valor mascarado e o escreve de volta no campo", () => {
    const c = campo("po26100471");
    expect(aplicarMascaraNumeroPo(c as unknown as HTMLInputElement, "")).toBe("PO26-10-0471");
    expect(c.value).toBe("PO26-10-0471");
    expect(c.selectionStart).toBe(12);
  });

  it("campo sem seleção (fora do DOM): não quebra", () => {
    const c = {
      value: "26100471",
      selectionStart: null as number | null,
      setSelectionRange() {
        throw new Error("sem seleção");
      },
    };
    expect(aplicarMascaraNumeroPo(c as unknown as HTMLInputElement, "")).toBe("PO26-10-0471");
  });
});

describe("DIR: digitar tecla a tecla", () => {
  it("'p' e 'po' viram 'PO'", () => {
    expect(digitar(dir(), "p").value).toBe("PO");
    expect(digitar(dir(), "po").value).toBe("PO");
    expect(digitar(dir(), "PO").value).toBe("PO");
  });

  it.each([
    ["26100471", "PO26-10-0471"],
    ["po26100471", "PO26-10-0471"],
    ["PO26100471", "PO26-10-0471"],
    ["po26-10-0471", "PO26-10-0471"],
  ])("digitar %j dá %j, no estado e no campo, com o cursor no fim", (texto, esperado) => {
    const f = dir();
    const c = digitar(f, texto);
    expect(f.ler()).toBe(esperado);
    expect(c.value).toBe(esperado);
    expect(c.selectionStart).toBe(esperado.length);
  });

  it("hífens automáticos, nunca pendurados, a cada tecla", () => {
    const f = dir();
    const c = campo("");
    const estados: string[] = [];
    for (const ch of "po26100471") {
      const inicio = c.selectionStart ?? c.value.length;
      c.value = c.value.slice(0, inicio) + ch + c.value.slice(inicio);
      c.selectionStart = inicio + 1;
      f.onInput(evento(c));
      estados.push(f.ler());
    }
    expect(estados).toEqual([
      "PO", // "p"
      "PO", // "o"
      "PO2",
      "PO26",
      "PO26-1",
      "PO26-10",
      "PO26-10-0",
      "PO26-10-04",
      "PO26-10-047",
      "PO26-10-0471",
    ]);
    for (const e of estados) expect(e.endsWith("-"), e).toBe(false);
  });

  it("no máximo 8 dígitos: o que passa é descartado e o campo não cresce", () => {
    const f = dir();
    const c = digitar(f, "po26100471999");
    expect(f.ler()).toBe("PO26-10-0471");
    expect(c.value).toBe("PO26-10-0471");
  });

  it("letras e símbolos depois do prefixo são ignorados", () => {
    const f = dir();
    digitar(f, "po26x10y-0471z");
    expect(f.ler()).toBe("PO26-10-0471");
  });
});

describe("DIR: colar", () => {
  it.each([
    ["po26100471", "PO26-10-0471"],
    ["PO26100471", "PO26-10-0471"],
    ["PO26-10-0471", "PO26-10-0471"],
    ["po26-10-0471", "PO26-10-0471"],
    ["26-10-0471", "PO26-10-0471"],
    ["26100471", "PO26-10-0471"],
    ["po 26 10 0471", "PO26-10-0471"],
    ["PO26/10/0471", "PO26-10-0471"],
    ["  PO26-10-0471  ", "PO26-10-0471"],
    ["PO 26-10 - 0471", "PO26-10-0471"],
    ["PO26–10–0471", "PO26-10-0471"],
    ["PO26-10-04711", "PO26-10-0471"],
    ["PO26-10", "PO26-10"],
    ["26", "PO26"],
    ["po", "PO"],
    ["abc", ""],
    ["", ""],
    ["  ", ""],
  ])("cola %j → %j (mesmo resultado do Follow-Up)", (colado, esperado) => {
    const f = dir();
    const c = colar(f, colado);
    expect(f.ler()).toBe(esperado);
    expect(c.value).toBe(esperado);
    expect(c.selectionStart).toBe(esperado.length); // cursor no fim do valor mascarado

    const fu = followUp();
    colar(fu, colado);
    expect(fu.ler()).toBe(f.ler());
  });

  it("colar em cima de um PO já preenchido troca o campo inteiro", () => {
    const f = dir();
    f.escrever("PO25-01-0001");
    const c = campo("po26100471");
    f.onInput(evento(c));
    expect(f.ler()).toBe("PO26-10-0471");
  });
});

describe("DIR: apagar e cursor", () => {
  it("no fim: PO26-10-0471 → … → PO26-1 → PO26 → PO2 → PO → vazio, sem travar", () => {
    const f = dir();
    f.escrever("PO26-10-0471");
    const estados: string[] = [];
    let guardas = 0;
    while (f.ler() !== "" && guardas++ < 30) {
      const v = f.ler();
      const c = campo(v.slice(0, -1)); // backspace no fim
      f.onInput(evento(c));
      expect(f.ler().length, `de "${v}"`).toBeLessThan(v.length);
      estados.push(f.ler());
    }
    expect(estados).toEqual([
      "PO26-10-047",
      "PO26-10-04",
      "PO26-10-0",
      "PO26-10",
      "PO26-1",
      "PO26",
      "PO2",
      "PO",
      "",
    ]);
  });

  it("apagar o hífen no fim não deixa o campo preso", () => {
    const f = dir();
    f.escrever("PO26-1");
    f.onInput(evento(campo("PO26-"))); // apagou o "1"
    expect(f.ler()).toBe("PO26");
  });

  it("'PO' sozinho: apagar o 'O' deixa o campo vazio", () => {
    const f = dir();
    f.escrever("PO");
    const c = campo("P");
    f.onInput(evento(c));
    expect(f.ler()).toBe("");
    expect(c.value).toBe("");
  });

  it("selecionar tudo e apagar deixa o campo vazio", () => {
    const f = dir();
    f.escrever("PO26-10-0471");
    f.onInput(evento(campo("", 0)));
    expect(f.ler()).toBe("");
  });

  it("apagar um dígito no meio: o cursor fica no ponto (não vai para o fim)", () => {
    const f = dir();
    f.escrever("PO26-10-0471");
    const c = campo("PO2-10-0471", 3); // apagou o "6" do ano
    f.onInput(evento(c));
    expect(f.ler()).toBe("PO21-00-471");
    expect(c.value).toBe("PO21-00-471");
    expect(c.selectionStart).toBe(3);
  });

  it("apagar a última casa do mês: o cursor fica depois do que sobrou antes dele", () => {
    const f = dir();
    f.escrever("PO26-10-0471");
    const c = campo("PO26-0-0471", 5); // apagou o "1" do mês
    f.onInput(evento(c));
    expect(f.ler()).toBe("PO26-00-471");
    expect(c.value).toBe("PO26-00-471");
    expect(c.selectionStart).toBe(4);
  });

  it("digitar um dígito no meio empurra o resto e o cursor fica logo depois dele", () => {
    const f = dir();
    f.escrever("PO26-10-0471");
    const c = campo("PO26-910-0471", 6); // digitou "9" antes do "1" do mês
    f.onInput(evento(c));
    expect(f.ler()).toBe("PO26-91-0047");
    expect(c.selectionStart).toBe(6);
  });
});

describe("DIR: a validação não mudou (PO obrigatório, regex completa)", () => {
  function preencher(texto: string) {
    const f = dir();
    f.f.form.paciente = "Fulano";
    digitar(f, texto);
    return f;
  }

  it("PO completo passa a regra do PO (o que falta é outro campo)", () => {
    const f = preencher("po26100471");
    expect(NUMERO_PO_REGEX.test(f.ler())).toBe(true);
    const r = f.f.validar();
    expect(r.valido ? "" : r.erro).not.toMatch(/PO26-MM-NNNN/);
  });

  it("PO incompleto ou vazio é recusado", () => {
    for (const texto of ["po2610", "po", ""]) {
      const r = preencher(texto).f.validar();
      expect(r, texto).toEqual({ valido: false, erro: "Informe o PO no padrão PO26-MM-NNNN." });
    }
  });

  it("a mensagem do Follow-Up segue a dele (não foi tocada)", () => {
    expect(NUMERO_PO_ERRO).toContain("PO26-10-0471");
  });
});

// ── O campo df-po do formulário montado de verdade, com o plugin global instalado ──────────────────

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];

function montarFormulario(editingDir = null as ReturnType<typeof novoDir> | null): HTMLInputElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () => h(DirFormModal, { editingDir, contagemPorPo: new Map<string, number>() }),
    }),
  );
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return document.getElementById("df-po") as HTMLInputElement;
}

function eventoDeInput(po: HTMLInputElement, texto: string, cursor = texto.length): void {
  po.value = texto;
  po.setSelectionRange(cursor, cursor);
  po.dispatchEvent(new InputEvent("input", { bubbles: true }));
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

describe("DirFormModal montado: df-po", () => {
  it("digitar tecla a tecla vira PO26-10-0471 no campo, com o plugin global instalado", async () => {
    const po = montarFormulario();
    let atual = "";
    for (const ch of "po26100471") {
      eventoDeInput(po, atual + ch);
      await nextTick();
      atual = po.value;
    }
    expect(po.value).toBe("PO26-10-0471");
  });

  it.each([
    ["26-10-0471", "PO26-10-0471"],
    ["PO26-10-0471", "PO26-10-0471"],
    ["po 26 10 0471", "PO26-10-0471"],
    ["abc", ""],
  ])("colar %j deixa %j", async (colado, esperado) => {
    const po = montarFormulario();
    eventoDeInput(po, colado);
    await nextTick();
    expect(po.value).toBe(esperado);
  });

  it("apagar o 'O' de 'PO' limpa o campo; 'p' vira 'PO'", async () => {
    const po = montarFormulario();
    eventoDeInput(po, "p");
    await nextTick();
    expect(po.value).toBe("PO");
    eventoDeInput(po, "P");
    await nextTick();
    expect(po.value).toBe("");
  });

  it("apagar no meio mantém o cursor no ponto", async () => {
    const po = montarFormulario(novoDir({ po: "PO26-10-0471" }));
    expect(po.value).toBe("PO26-10-0471");
    eventoDeInput(po, "PO2-10-0471", 3);
    await nextTick();
    expect(po.value).toBe("PO21-00-471");
    expect(po.selectionStart).toBe(3);
  });

  it("mantém data-sem-maiuscula, o placeholder do formato e a fonte monoespaçada", () => {
    const po = montarFormulario();
    expect(po.hasAttribute("data-sem-maiuscula")).toBe(true);
    expect(po.getAttribute("placeholder")).toBe("PO26-10-0471");
    expect(po.className).toContain("font-mono");
  });
});
