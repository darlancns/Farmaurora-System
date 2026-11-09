// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { Cadastro, Despachante, Fornecedor, ListaCadastro, CiaAerea } from "../../shared/types/Cadastro";
import CadastroFormModal from "../../app/components/configuracoes/CadastroFormModal.vue";
import CadastroLista from "../../app/components/configuracoes/CadastroLista.vue";

// Componentes reais no happy-dom: modal de criar/editar (nome só leitura ao editar, alerta sem padrão, duplicado e
// "Reativar") e a lista (tabela + cards, "(inativo)", ações só para quem edita).

const BASE = { id: "x", ativo: true, atualizadoPor: "", createdAt: "", updatedAt: "" };
const forn = (e: Partial<Fornecedor> = {}): Fornecedor => ({ ...BASE, nome: "Poros", pais: "Turquia", prazoAlertaDias: 3, semAlerta: false, ...e });
const desp = (e: Partial<Despachante> = {}): Despachante => ({ ...BASE, nome: "STAR CUSTOMS", contatoNome: "", telefone: "", email: "", ...e });
const cia = (e: Partial<CiaAerea> = {}): CiaAerea => ({ ...BASE, nome: "Ambiente", ...e });

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
});

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);

interface Eventos {
  criar: unknown[];
  atualizar: unknown[][];
  reativar: Cadastro[];
  invalid: string[];
  close: number;
}

function abrirModal(props: { lista: ListaCadastro; editando?: Cadastro | null; existentes?: Cadastro[]; busy?: boolean }): Eventos {
  const ev: Eventos = { criar: [], atualizar: [], reativar: [], invalid: [], close: 0 };
  montar(
    defineComponent({
      render: () =>
        h(CadastroFormModal, {
          lista: props.lista,
          editando: props.editando ?? null,
          existentes: props.existentes ?? [],
          busy: props.busy ?? false,
          onCriar: (p: unknown) => ev.criar.push(p),
          onAtualizar: (...a: unknown[]) => ev.atualizar.push(a),
          onReativar: (i: Cadastro) => ev.reativar.push(i),
          onInvalid: (m: string) => ev.invalid.push(m),
          onClose: () => (ev.close += 1),
        }),
    }),
  );
  return ev;
}

async function digitar(sel: string, valor: string): Promise<void> {
  const input = q<HTMLInputElement>(sel)!;
  input.value = valor;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
}

async function enviar(): Promise<void> {
  q<HTMLFormElement>("#cadastro-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
  await nextTick();
}

describe("CadastroFormModal — criar fornecedor", () => {
  it("o alerta nasce SEM nada selecionado e o formulário não salva sem decidir", async () => {
    const ev = abrirModal({ lista: "fornecedores" });
    expect(q<HTMLInputElement>("#cadastro-form-alerta-dias")!.checked).toBe(false);
    expect(q<HTMLInputElement>("#cadastro-form-alerta-sem")!.checked).toBe(false);
    expect(q("#cadastro-form-prazo")).toBeNull(); // o campo de dias só aparece ao escolher "Número de dias"
    expect(q("#cadastro-form-alerta-dica")).not.toBeNull();

    await digitar("#cadastro-form-nome", "Matsun");
    await enviar();
    expect(ev.criar).toHaveLength(0);
    expect(ev.invalid[0]).toMatch(/Defina o alerta/);
  });

  it("'Número de dias' mostra o campo; dias válidos criam o item", async () => {
    const ev = abrirModal({ lista: "fornecedores" });
    await digitar("#cadastro-form-nome", "Matsun");
    const radio = q<HTMLInputElement>("#cadastro-form-alerta-dias")!;
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();
    const prazo = q<HTMLInputElement>("#cadastro-form-prazo")!;
    expect(prazo.min).toBe("1");
    expect(prazo.max).toBe("365");

    await digitar("#cadastro-form-prazo", "400");
    await enviar();
    expect(ev.criar).toHaveLength(0);
    expect(ev.invalid.at(-1)).toMatch(/1 a 365/);

    await digitar("#cadastro-form-prazo", "7");
    await enviar();
    expect(ev.criar).toEqual([{ nome: "Matsun", pais: "", semAlerta: false, prazoAlertaDias: 7 }]);
  });

  it("'Sem alerta' (marcado de propósito) cria com prazo vazio", async () => {
    const ev = abrirModal({ lista: "fornecedores" });
    await digitar("#cadastro-form-nome", "Matsun");
    await digitar("#cadastro-form-pais", "Japão");
    const radio = q<HTMLInputElement>("#cadastro-form-alerta-sem")!;
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();
    await enviar();
    expect(ev.criar).toEqual([{ nome: "Matsun", pais: "Japão", semAlerta: true, prazoAlertaDias: null }]);
  });

  it("o país é opcional (não há erro por deixar vazio)", async () => {
    const ev = abrirModal({ lista: "fornecedores" });
    await digitar("#cadastro-form-nome", "Matsun");
    const radio = q<HTMLInputElement>("#cadastro-form-alerta-sem")!;
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();
    await enviar();
    expect(ev.invalid).toEqual([]);
    expect(ev.criar).toHaveLength(1);
  });
});

describe("CadastroFormModal — nome repetido e reservado", () => {
  it("duplicado ATIVO: aviso e botão de criar desabilitado", async () => {
    const ev = abrirModal({ lista: "cias-aereas", existentes: [cia({ id: "a", nome: "Ambiente" })] });
    await digitar("#cadastro-form-nome", "  ambiente ");
    expect(texto(q("#cadastro-form-aviso-duplicado"))).toMatch(/Já existe "Ambiente"/);
    expect(q("#btn-cadastro-reativar-duplicado")).toBeNull();
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(true);
    await enviar();
    expect(ev.criar).toHaveLength(0);
  });

  it("duplicado INATIVO: oferece 'Reativar' (que emite reativar com o item) e não deixa criar outro", async () => {
    const inativo = cia({ id: "b", nome: "Congelado", ativo: false });
    const ev = abrirModal({ lista: "cias-aereas", existentes: [inativo] });
    await digitar("#cadastro-form-nome", "CONGELADO");
    expect(texto(q("#cadastro-form-aviso-duplicado"))).toMatch(/\(inativo\).*Reative/);
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(true);
    q<HTMLButtonElement>("#btn-cadastro-reativar-duplicado")!.click();
    expect(ev.reativar).toEqual([inativo]);
    expect(ev.criar).toHaveLength(0);
  });

  it('"Outro" é nome reservado: aviso e criar desabilitado', async () => {
    abrirModal({ lista: "cias-aereas" });
    await digitar("#cadastro-form-nome", "outro");
    expect(q("#cadastro-form-aviso-reservado")).not.toBeNull();
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(true);
  });
});

describe("CadastroFormModal — editar (o nome é só leitura)", () => {
  it("não há campo de nome editável; o nome aparece como texto com a explicação", () => {
    abrirModal({ lista: "fornecedores", editando: forn() });
    expect(q("#cadastro-form-nome")).toBeNull();
    expect(texto(q("#cadastro-form-nome-leitura"))).toBe("Poros");
    expect(texto(q("#cadastro-form"))).toMatch(/O nome não pode ser alterado/);
    expect(texto(q("#cadastro-form-titulo"))).toBe("Editar fornecedor");
  });

  it("carrega país e alerta do item e o PATCH não leva o nome", async () => {
    const ev = abrirModal({ lista: "fornecedores", editando: forn({ id: "f1" }) });
    expect(q<HTMLInputElement>("#cadastro-form-pais")!.value).toBe("Turquia");
    expect(q<HTMLInputElement>("#cadastro-form-alerta-dias")!.checked).toBe(true);
    expect(q<HTMLInputElement>("#cadastro-form-prazo")!.value).toBe("3");

    await digitar("#cadastro-form-prazo", "10");
    await enviar();
    expect(ev.atualizar).toEqual([["f1", { pais: "Turquia", semAlerta: false, prazoAlertaDias: 10 }]]);
  });

  it("item inativo mostra o nome com (inativo) e nome igual a outro item não dá aviso de duplicado ao editar", () => {
    abrirModal({ lista: "fornecedores", editando: forn({ ativo: false }), existentes: [forn()] });
    expect(texto(q("#cadastro-form-nome-leitura"))).toBe("Poros (inativo)");
    expect(q("#cadastro-form-aviso-duplicado")).toBeNull();
  });

  it("despachante: contato, telefone e e-mail (formato validado só se preenchido)", async () => {
    const ev = abrirModal({ lista: "despachantes", editando: desp({ id: "d1" }) });
    expect(q("#cadastro-form-contato")).not.toBeNull();
    await digitar("#cadastro-form-email", "ruim");
    await enviar();
    expect(ev.atualizar).toHaveLength(0);
    expect(ev.invalid.at(-1)).toMatch(/e-mail/i);
    await digitar("#cadastro-form-email", "");
    await digitar("#cadastro-form-telefone", "11 3333-4444");
    await enviar();
    expect(ev.atualizar).toEqual([["d1", { contatoNome: "", telefone: "11 3333-4444", email: "" }]]);
  });

  it("cia aérea não tem campos além do nome", () => {
    abrirModal({ lista: "cias-aereas" });
    expect(q("#cadastro-form-pais")).toBeNull();
    expect(q("#cadastro-form-contato")).toBeNull();
    expect(q("#cadastro-form-alerta")).toBeNull();
  });

  it("Cancelar fecha", () => {
    const ev = abrirModal({ lista: "cias-aereas" });
    q<HTMLButtonElement>("#btn-cadastro-cancelar")!.click();
    expect(ev.close).toBe(1);
  });
});

describe("CadastroLista", () => {
  function lista(l: ListaCadastro, itens: Cadastro[], opcoes: { podeEditar?: boolean; carregando?: boolean } = {}): HTMLElement {
    return montar(
      defineComponent({
        render: () =>
          h(CadastroLista, {
            lista: l,
            itens,
            carregando: opcoes.carregando ?? false,
            podeEditar: opcoes.podeEditar ?? true,
          }),
      }),
    );
  }

  it("tabela e cards, com ids fixos por lista e item; inativo leva (inativo) e a situação escrita", () => {
    lista("fornecedores", [forn({ id: "f1" }), forn({ id: "f2", nome: "Zeta", ativo: false, semAlerta: true, prazoAlertaDias: null, pais: "" })]);
    expect(q("#cadastro-lista-fornecedores")).not.toBeNull();
    expect(texto(q("#cadastro-row-fornecedores-f1"))).toContain("Poros");
    expect(texto(q("#cadastro-row-fornecedores-f1"))).toContain("Turquia");
    expect(texto(q("#cadastro-row-fornecedores-f1"))).toContain("3 dias");
    expect(texto(q("#cadastro-row-fornecedores-f1"))).toContain("Ativo");
    expect(texto(q("#cadastro-row-fornecedores-f2"))).toContain("(inativo)");
    expect(texto(q("#cadastro-row-fornecedores-f2"))).toContain("Sem alerta");
    expect(texto(q("#cadastro-row-fornecedores-f2"))).toContain("Inativo");
    expect(texto(q("#cadastro-card-fornecedores-f2"))).toContain("(inativo)");
    expect(texto(q("#cadastro-card-fornecedores-f1"))).toContain("Alerta de prazo");
  });

  it("cabeçalhos da tabela por lista", () => {
    lista("despachantes", [desp({ id: "d1" })]);
    const titulos = [...document.querySelectorAll("#cadastro-lista-despachantes thead th")].map((th) => texto(th));
    expect(titulos).toEqual(["Nome", "Contato", "Telefone", "E-mail", "Situação", "Ações"]);
  });

  it("quem não edita não vê o menu de ações (leitura)", () => {
    lista("cias-aereas", [cia({ id: "t1" })], { podeEditar: false });
    expect(q("#btn-acoes-cadastro-cias-aereas-t1")).toBeNull();
    expect(q("#btn-acoes-cadastro-card-cias-aereas-t1")).toBeNull();
  });

  it("quem edita vê o menu de ações na tabela e no card", () => {
    lista("cias-aereas", [cia({ id: "t1" })], { podeEditar: true });
    expect(q("#btn-acoes-cadastro-cias-aereas-t1")).not.toBeNull();
    expect(q("#btn-acoes-cadastro-card-cias-aereas-t1")).not.toBeNull();
  });

  it("vazio e carregando", () => {
    lista("cias-aereas", []);
    expect(texto(q("#cadastro-lista-cias-aereas"))).toContain("Nenhum item cadastrado.");
    document.body.innerHTML = "";
    lista("cias-aereas", [], { carregando: true });
    expect(texto(q("#cadastro-lista-cias-aereas"))).toContain("Carregando…");
  });
});
