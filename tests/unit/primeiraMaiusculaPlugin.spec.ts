// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, nextTick, ref } from "vue";
import { useTitleCaseInput } from "../../app/composables/useTitleCaseInput";
import { normalizeText } from "../../app/utils/search";
import plugin from "../../app/plugins/primeira-maiuscula.client";

// O plugin cliente app/plugins/primeira-maiuscula.client.ts, instalado de verdade no `document` do
// happy-dom: um <input v-model> recebe o texto digitado (evento "input") e o estado do Vue deve vir já com a
// primeira letra maiúscula. `#app` (Nuxt) resolve para o substituto de tests/unit/helpers/nuxtAppStub.ts.

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];

function montar(template: string, setup: () => Record<string, unknown>): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(defineComponent({ template, setup }));
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return el;
}

function digitar(campo: HTMLInputElement | HTMLTextAreaElement, texto: string, extra: InputEventInit = {}): void {
  campo.value = texto;
  campo.dispatchEvent(new InputEvent("input", { bubbles: true, ...extra }));
}

beforeAll(() => {
  (plugin as unknown as () => void)();
});

function irPara(url: string): void {
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(url);
}

afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  irPara("http://localhost/processos");
});

describe("v-model", () => {
  it("<input v-model>: 'maria' digitado vira 'Maria' no campo E no estado do v-model", async () => {
    const texto = ref("");
    const el = montar('<input v-model="texto" />', () => ({ texto }));
    const campo = el.querySelector("input")!;

    digitar(campo, "maria");
    await nextTick();

    expect(campo.value).toBe("Maria");
    expect(texto.value).toBe("Maria");
  });

  it("<textarea v-model> também é tratado", async () => {
    const texto = ref("");
    const el = montar('<textarea v-model="texto"></textarea>', () => ({ texto }));
    const campo = el.querySelector("textarea")!;

    digitar(campo, "mensagem do recado");
    await nextTick();

    expect(texto.value).toBe("Mensagem do recado");
  });

  it("type=search (campos de busca) entra na regra e o type padrão (sem atributo) também", async () => {
    const busca = ref("");
    const livre = ref("");
    const el = montar('<div><input type="search" v-model="busca" /><input v-model="livre" /></div>', () => ({ busca, livre }));
    const [a, b] = Array.from(el.querySelectorAll("input"));

    digitar(a!, "joão");
    digitar(b!, "local de entrega");
    await nextTick();

    expect(busca.value).toBe("João");
    expect(livre.value).toBe("Local de entrega");
  });

  it("espaços iniciais são ignorados; o resto do texto não muda", async () => {
    const texto = ref("");
    const el = montar('<input v-model="texto" />', () => ({ texto }));
    digitar(el.querySelector("input")!, "  maRIA da silva");
    await nextTick();
    expect(texto.value).toBe("  MaRIA da silva");
  });

  it("texto que começa com dígito ou símbolo não é alterado", async () => {
    const texto = ref("");
    const el = montar('<input v-model="texto" />', () => ({ texto }));
    const campo = el.querySelector("input")!;

    digitar(campo, "123abc");
    await nextTick();
    expect(texto.value).toBe("123abc");

    digitar(campo, "#abc");
    await nextTick();
    expect(texto.value).toBe("#abc");
  });

  it("não altera a cada tecla: escreve só quando o valor realmente muda (sem loop de eventos)", async () => {
    const texto = ref("");
    const el = montar('<input v-model="texto" />', () => ({ texto }));
    const campo = el.querySelector("input")!;
    let eventos = 0;
    campo.addEventListener("input", () => eventos++);

    digitar(campo, "m");
    digitar(campo, "ma");
    digitar(campo, "mar");
    await nextTick();

    expect(texto.value).toBe("Mar");
    expect(eventos).toBe(3); // só os 3 do usuário; o plugin não dispara eventos extras
  });
});

describe("cursor e seleção", () => {
  it("o cursor não pula: fica onde estava", async () => {
    const texto = ref("");
    const el = montar('<input v-model="texto" />', () => ({ texto }));
    const campo = el.querySelector("input")!;
    campo.focus();

    campo.value = "maria";
    campo.setSelectionRange(2, 2);
    campo.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await nextTick();

    expect(campo.value).toBe("Maria");
    expect([campo.selectionStart, campo.selectionEnd]).toEqual([2, 2]);
  });

  it("a seleção (início, fim) também é preservada", async () => {
    const texto = ref("");
    const el = montar('<input v-model="texto" />', () => ({ texto }));
    const campo = el.querySelector("input")!;
    campo.focus();

    campo.value = "maria silva";
    campo.setSelectionRange(1, 5);
    campo.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await nextTick();

    expect(campo.value).toBe("Maria silva");
    expect([campo.selectionStart, campo.selectionEnd]).toEqual([1, 5]);
  });
});

describe("exclusões automáticas e data-sem-maiuscula", () => {
  it("type=password, email, number, date e demais tipos NÃO são alterados", async () => {
    const el = montar(
      `<div>
        <input id="pw" type="password" />
        <input id="em" type="email" />
        <input id="nu" type="number" />
        <input id="da" type="date" />
        <input id="te" type="tel" />
        <input id="ur" type="url" />
        <input id="hi" type="hidden" />
      </div>`,
      () => ({}),
    );
    digitar(el.querySelector<HTMLInputElement>("#pw")!, "maria");
    digitar(el.querySelector<HTMLInputElement>("#em")!, "maria@exemplo.com");
    digitar(el.querySelector<HTMLInputElement>("#ur")!, "https://exemplo.com");
    expect(el.querySelector<HTMLInputElement>("#pw")!.value).toBe("maria");
    expect(el.querySelector<HTMLInputElement>("#em")!.value).toBe("maria@exemplo.com");
    expect(el.querySelector<HTMLInputElement>("#ur")!.value).toBe("https://exemplo.com");
    // number/date/tel/hidden: nem chegam a aceitar letras; o evento não altera nada.
    for (const id of ["nu", "da", "te", "hi"]) {
      const campo = el.querySelector<HTMLInputElement>(`#${id}`)!;
      const antes = campo.value;
      campo.dispatchEvent(new InputEvent("input", { bubbles: true }));
      expect(campo.value, id).toBe(antes);
    }
  });

  it("type=text com inputmode numeric/decimal/tel/email/url NÃO é alterado", async () => {
    const el = montar(
      `<div>
        <input id="n" type="text" inputmode="numeric" />
        <input id="d" type="text" inputmode="decimal" />
        <input id="t" type="text" inputmode="tel" />
        <input id="e" type="text" inputmode="email" />
        <input id="u" type="text" inputmode="url" />
      </div>`,
      () => ({}),
    );
    for (const id of ["n", "d", "t", "e", "u"]) {
      const campo = el.querySelector<HTMLInputElement>(`#${id}`)!;
      digitar(campo, "abc");
      expect(campo.value, id).toBe("abc");
    }
  });

  it("autocomplete username/email/current-password/new-password/one-time-code NÃO é alterado", async () => {
    const el = montar(
      `<div>
        <input id="a" type="text" autocomplete="username" />
        <input id="b" type="text" autocomplete="email" />
        <input id="c" type="text" autocomplete="current-password" />
        <input id="d" type="text" autocomplete="new-password" />
        <input id="e" type="text" autocomplete="one-time-code" />
        <input id="f" type="text" autocomplete="section-x username" />
      </div>`,
      () => ({}),
    );
    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      const campo = el.querySelector<HTMLInputElement>(`#${id}`)!;
      digitar(campo, "abc");
      expect(campo.value, id).toBe("abc");
    }
  });

  it("autocomplete que não é sensível (off, name) segue na regra", () => {
    const el = montar(
      '<div><input id="a" type="text" autocomplete="off" /><input id="b" type="text" autocomplete="name" /></div>',
      () => ({}),
    );
    for (const id of ["a", "b"]) {
      const campo = el.querySelector<HTMLInputElement>(`#${id}`)!;
      digitar(campo, "abc");
      expect(campo.value, id).toBe("Abc");
    }
  });

  it("readonly e disabled NÃO são alterados", () => {
    const el = montar('<div><input id="r" type="text" readonly /><input id="d" type="text" disabled /></div>', () => ({}));
    for (const id of ["r", "d"]) {
      const campo = el.querySelector<HTMLInputElement>(`#${id}`)!;
      digitar(campo, "abc");
      expect(campo.value, id).toBe("abc");
    }
  });

  it("data-sem-maiuscula no próprio elemento desliga a regra (e o v-model fica com o texto como digitado)", async () => {
    const texto = ref("");
    const el = montar('<input data-sem-maiuscula v-model="texto" />', () => ({ texto }));
    digitar(el.querySelector("input")!, "abc-123");
    await nextTick();
    expect(texto.value).toBe("abc-123");
  });

  it("data-sem-maiuscula num ANCESTRAL também desliga", () => {
    const el = montar('<fieldset data-sem-maiuscula><div><input type="text" /><textarea></textarea></div></fieldset>', () => ({}));
    for (const campo of Array.from(el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))) {
      digitar(campo, "abc");
      expect(campo.value).toBe("abc");
    }
  });
});

describe("composição de texto (IME, teclas mortas)", () => {
  it("não altera durante a composição (isComposing)", async () => {
    const texto = ref("");
    const el = montar('<input v-model="texto" />', () => ({ texto }));
    const campo = el.querySelector("input")!;

    digitar(campo, "é", { isComposing: true });
    expect(campo.value).toBe("é");
  });

  it("não altera entre compositionstart e compositionend, mesmo sem isComposing no evento", async () => {
    const texto = ref("");
    const el = montar('<input v-model="texto" />', () => ({ texto }));
    const campo = el.querySelector("input")!;

    campo.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    digitar(campo, "é");
    expect(campo.value).toBe("é");
  });

  it("ao terminar a composição, capitaliza o valor final e avisa os ouvintes (um @input solto também enxerga)", async () => {
    vi.useFakeTimers();
    try {
      const estado = ref("");
      const campo = document.createElement("input");
      document.body.appendChild(campo);
      const lidos: string[] = [];
      campo.addEventListener("input", (e) => {
        const valor = (e.target as HTMLInputElement).value;
        estado.value = valor;
        lidos.push(valor);
      });

      campo.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      digitar(campo, "élida");
      campo.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
      vi.runAllTimers();

      expect(campo.value).toBe("Élida");
      expect(estado.value).toBe("Élida");
      expect(lidos.at(-1)).toBe("Élida");
      campo.remove();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("guarda temporária da DIR", () => {
  it("em /dir (e subrotas) o plugin NÃO age", async () => {
    const texto = ref("");
    const el = montar('<input v-model="texto" />', () => ({ texto }));
    const campo = el.querySelector("input")!;
    const setURL = irPara;

    setURL("http://localhost/dir");
    digitar(campo, "maria");
    await nextTick();
    expect(texto.value).toBe("maria");

    setURL("http://localhost/dir/x");
    digitar(campo, "joana");
    await nextTick();
    expect(texto.value).toBe("joana");
  });

  it("fora da DIR volta a agir (a guarda é avaliada a cada evento, navegação SPA incluída)", async () => {
    const texto = ref("");
    const el = montar('<input v-model="texto" />', () => ({ texto }));
    const campo = el.querySelector("input")!;
    const setURL = irPara;

    setURL("http://localhost/dir");
    digitar(campo, "maria");
    setURL("http://localhost/processos");
    digitar(campo, "joana");
    await nextTick();
    expect(texto.value).toBe("Joana");
  });
});

describe("convive com as regras existentes", () => {
  it("Title Case do nome (useTitleCaseInput, :value + @input): o resultado é o de sempre e o cursor não pula", async () => {
    const paciente = ref("");
    const onInput = useTitleCaseInput((v) => {
      paciente.value = v;
    });
    const el = montar('<input :value="paciente" @input="onInput" />', () => ({ paciente, onInput }));
    const campo = el.querySelector("input")!;
    campo.focus();

    // Texto que o Title Case só muda na 1ª letra: depois do plugin o handler devolve o MESMO valor que já
    // está no campo, o Vue não reescreve o campo e o cursor fica onde estava.
    campo.value = "joão";
    campo.setSelectionRange(2, 2);
    campo.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await nextTick();

    expect(paciente.value).toBe("João");
    expect(campo.value).toBe("João");
    expect(campo.selectionStart).toBe(2);
  });

  it("Title Case de várias palavras: o resultado é o de sempre (só a 1ª letra vem do plugin)", async () => {
    const paciente = ref("");
    const onInput = useTitleCaseInput((v) => {
      paciente.value = v;
    });
    const el = montar('<input :value="paciente" @input="onInput" />', () => ({ paciente, onInput }));
    const campo = el.querySelector("input")!;

    digitar(campo, "maria EDUARDA de souza");
    await nextTick();

    expect(paciente.value).toBe("Maria Eduarda de Souza");
    expect(campo.value).toBe("Maria Eduarda de Souza");
  });

  it("MAIÚSCULAS de medicamento (@input com toUpperCase) seguem valendo", async () => {
    const nome = ref("");
    const onInput = (e: Event) => {
      nome.value = (e.target as HTMLInputElement).value.toUpperCase();
    };
    const el = montar('<input :value="nome" @input="onInput" />', () => ({ nome, onInput }));
    const campo = el.querySelector("input")!;

    digitar(campo, "dipirona");
    await nextTick();

    expect(nome.value).toBe("DIPIRONA");
    expect(campo.value).toBe("DIPIRONA");
  });

  it("a busca segue sem acento e sem diferença de maiúscula (normalizeText não é afetado)", async () => {
    const busca = ref("");
    const nomes = ["Joao Silva", "Maria Eduarda", "ÉLIDA Souza"];
    const el = montar('<input type="search" v-model="busca" />', () => ({ busca }));
    const campo = el.querySelector("input")!;

    const achados = () => nomes.filter((n) => normalizeText(n).includes(normalizeText(busca.value)));

    digitar(campo, "joão");
    await nextTick();
    expect(busca.value).toBe("João"); // 1ª letra maiúscula pelo plugin
    expect(achados()).toEqual(["Joao Silva"]);

    digitar(campo, "élida");
    await nextTick();
    expect(achados()).toEqual(["ÉLIDA Souza"]);

    digitar(campo, "MARIA");
    await nextTick();
    expect(achados()).toEqual(["Maria Eduarda"]);
  });
});
