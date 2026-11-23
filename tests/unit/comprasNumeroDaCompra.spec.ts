// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import type { Compra, MudancasCompra } from "../../shared/types/compra";
import { descricaoDaCompra } from "../../shared/utils/compraMes";
import CompraLinhaNumero from "../../app/components/compras/CompraLinhaNumero.vue";
import CompraNovaDialogo from "../../app/components/compras/CompraNovaDialogo.vue";
import { compraVaziaDeTeste } from "./helpers/compraFixtures";

// O Nº da compra é DIGITADO: a caixinha do "+ Nova compra" / "Duplicar compra" (sugestão, erro no campo, Enter e Esc) e o primeiro campo do
// formulário (editável, validado, com o erro do servidor). Componentes REAIS no happy-dom. Dados fictícios (TESTE).

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];
function montar(componente: ReturnType<typeof defineComponent>): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(componente);
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return el;
}
afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  document.body.innerHTML = "";
});

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);

async function digitar(input: HTMLInputElement, valor: string): Promise<void> {
  input.value = valor;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
}

describe("descricaoDaCompra — como as mensagens falam da compra", () => {
  it("'Compra 14 de novembro' (2 dígitos, mês por extenso em minúsculas); mês inválido: só o rótulo curto", () => {
    expect(descricaoDaCompra("2026-11", 14)).toBe("Compra 14 de novembro");
    expect(descricaoDaCompra("2026-10", 3)).toBe("Compra 03 de outubro");
    expect(descricaoDaCompra("2026-03", 7)).toBe("Compra 07 de março");
    expect(descricaoDaCompra("lixo", 5)).toBe("Compra 05");
  });
});

// ── A caixinha ──────────────────────────────────────────────────────────────────────────────────────────────────

interface PropsDialogo {
  tipo?: "nova" | "duplicar";
  rotuloMes?: string;
  sugestao?: number | null;
  maior?: number | null;
  erro?: string | null;
  ocupado?: boolean;
}

function dialogo(props: PropsDialogo = {}) {
  const eventos: Array<[string, unknown]> = [];
  const estado = ref<Required<PropsDialogo>>({ tipo: "nova", rotuloMes: "Novembro/2026", sugestao: 19, maior: 18, erro: null, ocupado: false, ...props });
  montar(
    defineComponent({
      render: () =>
        h(CompraNovaDialogo, {
          ...estado.value,
          onConfirmar: (n: number) => eventos.push(["confirmar", n]),
          onCancelar: () => eventos.push(["cancelar", null]),
        }),
    }),
  );
  return { eventos, estado };
}

const campo = () => q<HTMLInputElement>("#compra-dialogo-numero")!;
const enviar = () => q<HTMLFormElement>("#compra-dialogo")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

describe("CompraNovaDialogo: o que a pessoa vê", () => {
  it("título 'Nova compra', o mês e a instrução, o campo 'Nº da compra' já com a sugestão e a frase de apoio", () => {
    dialogo();
    const caixa = q("#compra-dialogo")!;
    expect(caixa.getAttribute("role")).toBe("dialog");
    expect(texto(q("#compra-dialogo-titulo"))).toBe("Nova compra");
    expect(texto(q("#compra-dialogo-texto"))).toBe("Novembro/2026. Digite o número combinado com o time.");
    expect(texto(q('label[for="compra-dialogo-numero"]'))).toBe("Nº da compra");
    expect(campo().value).toBe("19");
    expect(texto(q("#compra-dialogo-apoio"))).toBe("Sugestão: a próxima depois da 18. Pode trocar.");
    expect(q("#compra-dialogo-erro")).toBeNull();
  });

  it("o mês mostrado é o que veio (Outubro/2026 aparece como Outubro/2026)", () => {
    dialogo({ rotuloMes: "Outubro/2026", sugestao: 4, maior: 3 });
    expect(texto(q("#compra-dialogo-texto"))).toBe("Outubro/2026. Digite o número combinado com o time.");
    expect(campo().value).toBe("4");
  });

  it("mês vazio: sugestão 1 e 'a primeira do mês'", () => {
    dialogo({ sugestao: 1, maior: 0 });
    expect(campo().value).toBe("1");
    expect(texto(q("#compra-dialogo-apoio"))).toBe("Sugestão: a primeira do mês. Pode trocar.");
  });

  it("duplicar: o título é 'Duplicar compra'", () => {
    dialogo({ tipo: "duplicar" });
    expect(texto(q("#compra-dialogo-titulo"))).toBe("Duplicar compra");
  });

  it("dois botões: 'Cancelar' e 'Criar compra' (o segundo é o do Enter); o foco vai para o campo", () => {
    dialogo();
    expect(texto(q("#btn-compra-dialogo-cancelar"))).toBe("Cancelar");
    expect(texto(q("#btn-compra-dialogo-criar"))).toBe("Criar compra");
    expect(q<HTMLButtonElement>("#btn-compra-dialogo-criar")!.type).toBe("submit");
    expect(q<HTMLButtonElement>("#btn-compra-dialogo-cancelar")!.type).toBe("button");
    expect(document.activeElement).toBe(campo());
  });

  it("a sugestão que chega DEPOIS preenche o campo; se a pessoa já digitou, não mexe", async () => {
    const { estado, eventos } = dialogo({ sugestao: null, maior: null });
    expect(campo().value).toBe("");
    expect(texto(q("#compra-dialogo-apoio"))).toBe("Buscando a sugestão…");
    estado.value = { ...estado.value, sugestao: 19, maior: 18 };
    await nextTick();
    expect(campo().value).toBe("19");

    const outra = dialogo({ sugestao: null, maior: null });
    const campos = document.querySelectorAll<HTMLInputElement>("#compra-dialogo-numero");
    await digitar(campos[1]!, "7");
    outra.estado.value = { ...outra.estado.value, sugestao: 19, maior: 18 };
    await nextTick();
    expect(campos[1]!.value).toBe("7");
    expect(eventos).toEqual([]);
  });
});

describe("CompraNovaDialogo: criar, erros e cancelar", () => {
  it("'Criar compra' (e o Enter, que envia o formulário) manda o número do campo", async () => {
    const { eventos } = dialogo();
    enviar();
    expect(eventos).toEqual([["confirmar", 19]]);
    await digitar(campo(), "14");
    q<HTMLButtonElement>("#btn-compra-dialogo-criar")!.click();
    enviar();
    expect(eventos.at(-1)).toEqual(["confirmar", 14]);
  });

  it("só dígitos entram no campo (letras, sinais e vírgula são cortados)", async () => {
    dialogo();
    await digitar(campo(), "1a4,5-");
    expect(campo().value).toBe("145");
  });

  it.each([
    ["vazio", ""],
    ["zero", "0"],
    ["acima de 9999", "10000"],
  ])("número inválido (%s): o erro aparece NO CAMPO, nada é enviado e o botão NÃO fica desabilitado", async (_nome, valor) => {
    const { eventos } = dialogo();
    const criar = q<HTMLButtonElement>("#btn-compra-dialogo-criar")!;
    await digitar(campo(), valor);
    expect(criar.disabled).toBe(false);
    enviar();
    await nextTick();
    expect(eventos).toEqual([]);
    expect(texto(q("#compra-dialogo-erro"))).toBe("Nº da compra: informe um número inteiro de 1 a 9999.");
    expect(campo().getAttribute("aria-invalid")).toBe("true");
    // digitar de novo limpa o erro
    await digitar(campo(), "5");
    expect(q("#compra-dialogo-erro")).toBeNull();
  });

  it("o erro do servidor (número repetido) aparece no campo e o que foi digitado fica", async () => {
    const { estado } = dialogo();
    await digitar(campo(), "14");
    estado.value = { ...estado.value, erro: "A Compra 14 de novembro já existe (Rebeca, Can Pharma). Escolha outro número." };
    await nextTick();
    expect(texto(q("#compra-dialogo-erro"))).toBe("A Compra 14 de novembro já existe (Rebeca, Can Pharma). Escolha outro número.");
    expect(q("#compra-dialogo-erro")!.getAttribute("role")).toBe("alert");
    expect(campo().value).toBe("14");
    expect(q<HTMLButtonElement>("#btn-compra-dialogo-criar")!.disabled).toBe(false);
  });

  it("criando (ocupado): novos cliques e o Cancelar são ignorados", async () => {
    const { eventos } = dialogo({ ocupado: true });
    enviar();
    q<HTMLButtonElement>("#btn-compra-dialogo-cancelar")!.click();
    expect(eventos).toEqual([]);
    expect(q("#compra-dialogo")!.getAttribute("aria-busy")).toBe("true");
  });

  it("'Cancelar', o Esc e o clique fora cancelam", () => {
    const { eventos } = dialogo();
    q<HTMLButtonElement>("#btn-compra-dialogo-cancelar")!.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    q<HTMLElement>("#compra-dialogo-overlay")!.click();
    expect(eventos).toEqual([["cancelar", null], ["cancelar", null], ["cancelar", null]]);
  });
});

// ── O 1º campo do formulário ────────────────────────────────────────────────────────────────────────────────────

function linhaNumero(extra: { sequencia?: number; desabilitado?: boolean; erro?: string | null } = {}) {
  const eventos: MudancasCompra[] = [];
  const compra: Compra = compraVaziaDeTeste({ sequencia: extra.sequencia ?? 14 });
  montar(
    defineComponent({
      render: () =>
        h(CompraLinhaNumero, {
          compra,
          desabilitado: extra.desabilitado ?? false,
          erroDoServidor: extra.erro ?? null,
          onAlterar: (m: MudancasCompra) => eventos.push(m),
        }),
    }),
  );
  return eventos;
}

const numero = () => q<HTMLInputElement>("#compra-numero")!;
const sair = () => numero().dispatchEvent(new Event("change", { bubbles: true }));

describe("CompraLinhaNumero: 'Nº da compra', a 1ª linha do formulário", () => {
  it("rótulo 'Nº da compra' e o número atual", () => {
    linhaNumero();
    expect(q('[data-linha="titulo"]')).not.toBeNull();
    expect(texto(q('label[for="compra-numero"]'))).toBe("Nº da compra");
    expect(numero().value).toBe("14");
    expect(numero().disabled).toBe(false);
  });

  it("só aplica ao SAIR do campo (digitar '14' passa por '1' sem tentar o número 1)", async () => {
    const eventos = linhaNumero({ sequencia: 5 });
    await digitar(numero(), "1");
    await digitar(numero(), "14");
    expect(eventos).toEqual([]);
    sair();
    expect(eventos).toEqual([{ sequencia: 14 }]);
  });

  it("Enter também aplica (e não envia nada); o mesmo número não gera mudança", async () => {
    const eventos = linhaNumero({ sequencia: 5 });
    await digitar(numero(), "9");
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    numero().dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(eventos).toEqual([{ sequencia: 9 }]);
    await digitar(numero(), "5");
    sair();
    expect(eventos).toHaveLength(1); // 5 é o que a compra tem: nada a salvar
  });

  it.each([
    ["vazio", ""],
    ["zero", "0"],
    ["acima de 9999", "10000"],
  ])("número inválido (%s): mostra o erro no campo e NÃO aplica", async (_nome, valor) => {
    const eventos = linhaNumero();
    await digitar(numero(), valor);
    sair();
    await nextTick();
    expect(eventos).toEqual([]);
    expect(texto(q("#compra-linha-titulo-erro"))).toBe("Nº da compra: informe um número inteiro de 1 a 9999.");
    expect(numero().getAttribute("aria-invalid")).toBe("true");
  });

  it("só dígitos entram no campo", async () => {
    linhaNumero();
    await digitar(numero(), "2x3");
    expect(numero().value).toBe("23");
  });

  it("o erro do servidor (número repetido) aparece na linha, sem perder o digitado", async () => {
    linhaNumero({ erro: "A Compra 06 de novembro já existe (Rebeca, Can Pharma). Escolha outro número." });
    await nextTick();
    expect(texto(q("#compra-linha-titulo-erro"))).toBe("A Compra 06 de novembro já existe (Rebeca, Can Pharma). Escolha outro número.");
    expect(numero().value).toBe("14");
  });

  it("sem permissão (sócio) ou compra cancelada: o campo fica desabilitado", () => {
    linhaNumero({ desabilitado: true });
    expect(numero().disabled).toBe(true);
  });
});
