// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { useState } from "#app";
import type { Compra } from "../../shared/types/compra";
import { compraParaResumoEntrada, montarResumo, resumoParaTexto } from "../../shared/utils/compraResumo";
import CompraColunaDireita from "../../app/components/compras/CompraColunaDireita.vue";
import { compraComUmMedicamento, compraDeTeste, digitar, montarFormulario, q, qa, texto, type FormularioMontado } from "./helpers/montarFormulario";

// A coluna da direita: SÓ o resumo. Botões "Copiar resumo" (copia o texto do modo "copia") e "Encaminhar para a DIR" (visível e
// DESABILITADO); o resumo ao vivo no modo "modelo", linha a linha, com o vazio como traço. Nada de checklist, pendências nem "Dicas".
// Dados fictícios (TESTE).

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];
function montar(componente: ReturnType<typeof defineComponent>): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(componente);
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return el;
}
let formulario: FormularioMontado | null = null;
beforeEach(() => {
  useState<string | null>("toast-message").value = null;
});
afterEach(() => {
  formulario?.desmontar();
  formulario = null;
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  // @ts-expect-error: remove o stub entre os testes
  delete document.execCommand;
});

const toast = () => useState<string | null>("toast-message").value;
const DESPACHANTE = { nome: "Despachante Teste", telefone: "11 90000-0000", email: "d@teste.invalid", contatoNome: "Contato D" };

function coluna(c: Compra, despachanteCadastro: typeof DESPACHANTE | null = null): void {
  montar(defineComponent({ render: () => h(CompraColunaDireita, { compra: c, despachanteCadastro }) }));
}

const linhaDoResumo = (id: string) => q<HTMLElement>(`[data-resumo-linha="${id}"]`);

describe("botões do topo", () => {
  it("'Copiar resumo' e 'Encaminhar para a DIR' lado a lado, nesta ordem, antes do resumo", () => {
    coluna(compraDeTeste());
    const barra = q("#compra-barra-acoes")!;
    expect([...barra.querySelectorAll("button")].map((b) => texto(b))).toEqual(["Copiar resumo", "Encaminhar para a DIR"]);
    expect(barra.className).toContain("flex");
    expect(barra.className).not.toContain("flex-col"); // lado a lado
    expect(barra.compareDocumentPosition(q("#compra-resumo")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("'Encaminhar para a DIR': VISÍVEL e DESABILITADO, com o title 'Em breve: depende da migração da DIR'", () => {
    coluna(compraDeTeste());
    const b = q<HTMLButtonElement>("#btn-encaminhar-dir")!;
    expect(b.disabled).toBe(true);
    expect(texto(b)).toBe("Encaminhar para a DIR");
    expect(b.getAttribute("title")).toBe("Em breve: depende da migração da DIR");
    expect(b.className).not.toContain("bg-accent-dark");
  });

  it("'Copiar resumo' (primário) copia EXATAMENTE o texto do modo 'copia' e avisa 'Resumo copiado'", async () => {
    const c = compraDeTeste({ paciente: "PACIENTE <TESTE> & 'aspas'", localAplicacao: "" });
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    coluna(c, DESPACHANTE);
    const esperado = resumoParaTexto(montarResumo(compraParaResumoEntrada(c, DESPACHANTE), "copia"));
    const botao = q<HTMLButtonElement>("#btn-copiar-resumo")!;
    expect(botao.className).toContain("bg-accent-dark");
    botao.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]![0]).toBe(esperado);
    // É o texto da CÓPIA (com 'pendente ⏳' e os contatos do despachante), não o do modelo da tela.
    expect(esperado).toContain("Local de aplicação: pendente ⏳");
    expect(esperado).toContain("Phone: 11 90000-0000");
    await vi.waitFor(() => expect(toast()).toBe("Resumo copiado"));
  });

  it("falha ao copiar: toast de erro", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn(async () => {
          throw new Error("negado");
        }),
      },
    });
    coluna(compraDeTeste());
    q<HTMLButtonElement>("#btn-copiar-resumo")!.click();
    await vi.waitFor(() => expect(toast()).toMatch(/^Não foi possível copiar o resumo/));
  });

  it("o 'Copiar resumo' não depende de permissão: está sempre habilitado (a coluna nem recebe a permissão)", () => {
    coluna(compraDeTeste());
    expect(q<HTMLButtonElement>("#btn-copiar-resumo")!.disabled).toBe(false);
  });
});

describe("o resumo (modelo) linha a linha", () => {
  it("todos os rótulos do modelo aparecem, na ordem, como linhas (data-resumo-linha = id da linha)", () => {
    const c = compraDeTeste();
    coluna(c, DESPACHANTE);
    const ids = montarResumo(compraParaResumoEntrada(c, DESPACHANTE), "modelo").flatMap((b) => b.linhas.map((l) => l.id));
    expect(qa("[data-resumo-linha]").map((e) => e.getAttribute("data-resumo-linha"))).toEqual(ids);
    expect(texto(linhaDoResumo("titulo"))).toBe("Compra 03 - Novembro/2026");
    expect(texto(linhaDoResumo("laboratorio"))).toBe("Laboratório: Lab Teste");
    expect(texto(linhaDoResumo("envio"))).toBe("Envio: Air Cargo (Emirates)");
    expect(texto(linhaDoResumo("cnpj"))).toBe("CNPJ: Farmaurora");
    expect(texto(linhaDoResumo("broker_telefone"))).toBe("Phone: 11 90000-0000");
  });

  it("valor VAZIO = traço tracejado discreto (com rótulo); a compra vazia mostra todos os rótulos", () => {
    coluna(compraComUmMedicamento());
    const lab = linhaDoResumo("laboratorio")!;
    expect(lab.getAttribute("data-vazio")).toBe("true");
    expect(texto(lab)).toBe("Laboratório:");
    const traco = lab.querySelector("[data-resumo-vazio]")!;
    expect(traco.className).toContain("border-dashed");
    // sem 'pendente ⏳' nem 'n/a' inventados no modelo
    expect(texto(q("#compra-resumo-texto"))).not.toContain("pendente");
    expect(texto(q("#compra-resumo-texto"))).not.toContain("n/a");
    expect(qa("[data-resumo-linha][data-vazio]").length).toBeGreaterThan(20);
  });

  it("a linha do Paciente sai em destaque (negrito, como na cópia) e o título é um cabeçalho", () => {
    coluna(compraDeTeste({ paciente: "PACIENTE TESTE DA SILVA" }));
    const valor = linhaDoResumo("paciente")!.querySelectorAll("span")[1]!;
    expect(texto(valor)).toBe("Paciente Teste da Silva");
    expect(valor.className).toContain("font-semibold");
    expect(linhaDoResumo("titulo")!.tagName).toBe("H4");
  });

  it("agrupa em blocos (um por bloco do resumo), como o texto copiado", () => {
    coluna(compraDeTeste());
    const blocos = qa("[data-resumo-bloco]").map((b) => b.getAttribute("data-resumo-bloco"));
    expect(blocos[0]).toBe("titulo");
    expect(blocos).toContain("consultor_responsavel");
    expect(blocos.at(-1)).toBe("contatos");
  });

  it("nada de PIX no resumo nem na tela, mesmo que o objeto do despachante traga a chave", () => {
    const comPix = { ...DESPACHANTE, chavePix: "CHAVE-PIX-SECRETA-TESTE", chave_pix: "CHAVE-PIX-SECRETA-TESTE" };
    coluna(compraDeTeste(), comPix);
    expect(document.body.textContent).not.toContain("CHAVE-PIX-SECRETA-TESTE");
    expect(document.body.innerHTML.toLowerCase()).not.toMatch(/chave_?pix/);
  });

  it("nada de checklist, 'antes de encaminhar', pendências nem 'Dicas' na coluna", () => {
    coluna(compraDeTeste());
    const t = document.body.textContent ?? "";
    expect(t).not.toMatch(/antes de encaminhar/i);
    expect(t).not.toMatch(/Dicas/);
    expect(t).not.toMatch(/itens ok/i);
    expect(q("#compra-checklist")).toBeNull();
    expect(q('[data-item]')).toBeNull();
    expect(t).not.toMatch(/vendedor/i);
  });

  it("acompanha a compra AO VIVO (a prop muda, a tela muda, sem salvar)", async () => {
    const compra = ref(compraComUmMedicamento());
    montar(defineComponent({ render: () => h(CompraColunaDireita, { compra: compra.value, despachanteCadastro: null }) }));
    expect(linhaDoResumo("paciente")!.getAttribute("data-vazio")).toBe("true");
    compra.value = { ...compra.value, paciente: "PACIENTE NOVO" };
    await nextTick();
    expect(linhaDoResumo("paciente")!.getAttribute("data-vazio")).toBeNull();
    expect(texto(linhaDoResumo("paciente"))).toBe("Paciente: Paciente Novo");
  });
});

describe("o resumo preenche os vazios enquanto se digita no formulário (ligado ao editor)", () => {
  it("digitar paciente, laboratório e local no formulário atualiza o resumo da direita", async () => {
    formulario = montarFormulario(compraComUmMedicamento(), { comResumo: true });
    expect(linhaDoResumo("paciente")!.getAttribute("data-vazio")).toBe("true");
    expect(linhaDoResumo("laboratorio")!.getAttribute("data-vazio")).toBe("true");
    await digitar("#compra-paciente", "paciente teste");
    await digitar("#compra-local", "Hospital Teste");
    const id = formulario.compra().itens[0]!.id;
    await digitar(`#compra-item-${id}-laboratorio`, "Lab Teste");
    expect(texto(linhaDoResumo("paciente"))).toBe("Paciente: Paciente Teste");
    expect(texto(linhaDoResumo("local_aplicacao"))).toBe("Local de aplicação: Hospital Teste");
    expect(texto(linhaDoResumo("laboratorio"))).toBe("Laboratório: Lab Teste");
    expect(linhaDoResumo("paciente")!.getAttribute("data-vazio")).toBeNull();
  });

  it("com 2 medicamentos o resumo mostra 'Medicamento 1' e 'Medicamento 2'", async () => {
    formulario = montarFormulario(compraComUmMedicamento(), { comResumo: true });
    q<HTMLButtonElement>("#compra-adicionar-medicamento")!.click();
    await nextTick();
    expect(linhaDoResumo("medicamento_1")).not.toBeNull();
    expect(linhaDoResumo("medicamento_2")).not.toBeNull();
    expect(linhaDoResumo("medicamento")).toBeNull();
  });
});
