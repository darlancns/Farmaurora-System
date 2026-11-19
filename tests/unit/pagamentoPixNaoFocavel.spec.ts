// @vitest-environment happy-dom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import NovoGrupoPagamentoModal from "../../app/components/pagamentos/modals/NovoGrupoPagamentoModal.vue";

// Modal "Adicionar pagamento" (Despachante e Transportadora): a Chave PIX é SÓ LEITURA e NÃO é campo de formulário. Rótulo "Chave PIX"
// (sem "(do Cadastro)"); um div com o visual do campo desabilitado, sem tabindex, sem foco por clique e sem contorno de foco; o texto
// segue visível e selecionável; sem chave, "—"; acessível por aria-labelledby. Valores de PIX FICTÍCIOS e nomes "TESTE".

vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-18",
}));

const PIX = "chave-ficticia-modal-0001";
const ITENS = [
  { nome: "Despachante Teste A", ativo: true, pais: "" },
  { nome: "Despachante Teste B", ativo: true, pais: "" },
  { nome: "Sem Chave Teste", ativo: true, pais: "" },
];
const PIX_MAP = { "Despachante Teste A": PIX, "Despachante Teste B": "chave-ficticia-modal-0002" };

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];

function abrir(tipo: "DESPACHANTE" | "TRANSPORTADORA" = "DESPACHANTE"): void {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () => h(NovoGrupoPagamentoModal, { tipo, empresa: "FARMAURORA", itens: ITENS, pixMap: PIX_MAP }),
    }),
  );
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
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
const pix = () => document.getElementById("ng-chave-pix") as HTMLElement;

async function escolher(nome: string): Promise<void> {
  document.getElementById("ng-nome-grupo")!.click();
  await nextTick();
  const opcao = [...document.querySelectorAll("#ng-nome-grupo-listbox [role='option']")].find((li) => texto(li) === nome)!;
  opcao.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await nextTick();
}

describe("Chave PIX do modal Adicionar pagamento — rótulo", () => {
  it("o rótulo é só 'Chave PIX' (sem '(do Cadastro)'), em Despachante e em Transportadora", async () => {
    for (const tipo of ["DESPACHANTE", "TRANSPORTADORA"] as const) {
      abrir(tipo);
      await nextTick();
      expect(texto(document.getElementById("ng-chave-pix-rotulo"))).toBe("Chave PIX");
      expect(texto(document.getElementById("form-novo-grupo-pagamento"))).not.toContain("(do Cadastro)");
      montados.pop()!.unmount();
      document.body.innerHTML = "";
    }
  });

  it("o texto '(do Cadastro)' não aparece em nenhum texto da tela de Pagamentos (modais, cards, tooltips, aria-labels)", () => {
    const RAIZ = process.cwd();
    const arquivos = (pasta: string): string[] =>
      readdirSync(pasta).flatMap((nome) => {
        const caminho = join(pasta, nome);
        return statSync(caminho).isDirectory() ? arquivos(caminho) : /\.(vue|ts)$/.test(nome) ? [caminho] : [];
      });
    const todos = [join(RAIZ, "app/pages/pagamentos.vue"), ...arquivos(join(RAIZ, "app/components/pagamentos")), join(RAIZ, "app/utils/pagamentoOptions.ts"), join(RAIZ, "app/composables/usePagamentos.ts")];
    const violacoes = todos.filter((f) => /\(do Cadastro\)/.test(readFileSync(f, "utf-8"))).map((f) => relative(RAIZ, f).split(sep).join("/"));
    expect(violacoes).toEqual([]);
  });
});

describe("Chave PIX do modal Adicionar pagamento — não é campo e não recebe foco", () => {
  it("a chave aparece como TEXTO do div (legível), e sem chave mostra '—'", async () => {
    abrir();
    await nextTick();
    expect(texto(pix())).toBe("—");
    await escolher("Despachante Teste A");
    expect(texto(pix())).toBe(PIX);
    await escolher("Sem Chave Teste");
    expect(texto(pix())).toBe("—");
    await escolher("Despachante Teste B");
    expect(texto(pix())).toBe("chave-ficticia-modal-0002");
  });

  it("não é focável: sem INPUT/TEXTAREA/SELECT/BUTTON, sem tabindex (nem no elemento nem dentro), sem contenteditable", async () => {
    abrir();
    await nextTick();
    await escolher("Despachante Teste A");
    const el = pix();
    expect(el.tagName).toBe("DIV");
    expect(el.querySelector("input, textarea, select, button, a[href]")).toBeNull();
    expect(el.hasAttribute("tabindex")).toBe(false);
    expect(el.querySelector("[tabindex]")).toBeNull();
    expect(el.hasAttribute("contenteditable")).toBe(false);
    expect(el.hasAttribute("readonly")).toBe(false);
    expect((el as unknown as { readOnly?: boolean }).readOnly).toBeUndefined();
  });

  it("clicar nele não leva o foco para lá (um div sem tabindex não recebe foco por clique no navegador; o e2e confere no Chromium)", async () => {
    abrir();
    await nextTick();
    await escolher("Despachante Teste A");
    pix().click();
    expect(document.activeElement).not.toBe(pix());
    expect(pix().hasAttribute("tabindex")).toBe(false);
  });

  it("fora da ordem do Tab: nenhum elemento focável do formulário é a chave PIX nem está dentro dela", async () => {
    abrir();
    await nextTick();
    const form = document.getElementById("form-novo-grupo-pagamento")!;
    const focaveis = [...form.querySelectorAll<HTMLElement>("input, select, textarea, button, a[href], [tabindex]")];
    expect(focaveis.length).toBeGreaterThan(0); // (o select, o paciente, o valor… continuam focáveis)
    for (const f of focaveis) {
      expect(f.id, "o próprio elemento").not.toBe("ng-chave-pix");
      expect(pix().contains(f), "dentro da chave").toBe(false);
    }
  });

  it("sem contorno de foco e sem cursor de campo: as classes não trazem focus/outline e o cursor é o padrão", async () => {
    abrir();
    await nextTick();
    const classes = pix().className;
    expect(classes).not.toMatch(/focus|outline|ring/);
    expect(classes).toContain("cursor-default");
    expect(classes).toContain("select-text"); // o texto continua selecionável com o mouse
  });

  it("acessível: o grupo é nomeado pelo rótulo (aria-labelledby → 'Chave PIX') e o texto da chave está dentro dele para o leitor de tela", async () => {
    abrir();
    await nextTick();
    await escolher("Despachante Teste A");
    const el = pix();
    expect(el.getAttribute("role")).toBe("group");
    const rotulo = document.getElementById(el.getAttribute("aria-labelledby")!);
    expect(texto(rotulo)).toBe("Chave PIX");
    expect(el.textContent).toContain(PIX);
  });

  it("a chave nunca vira o valor de um campo: nenhum input do modal tem a chave como value", async () => {
    abrir();
    await nextTick();
    await escolher("Despachante Teste A");
    const valores = [...document.querySelectorAll<HTMLInputElement>("#form-novo-grupo-pagamento input")].map((i) => i.value);
    expect(valores).not.toContain(PIX);
  });
});

describe("os cards de Pagamentos mostram a chave como texto (nenhum campo clicável)", () => {
  it("GrupoPagamentoCard e GrupoPagamentoExportCard exibem grupo.chavePix só em <span>, sem input/tabindex ao redor", () => {
    const RAIZ = process.cwd();
    for (const arquivo of ["app/components/pagamentos/cards/GrupoPagamentoCard.vue", "app/components/pagamentos/cards/GrupoPagamentoExportCard.vue"]) {
      const fonte = readFileSync(join(RAIZ, arquivo), "utf-8");
      const linhas = fonte.split(/\r?\n/);
      const idx = linhas.findIndex((l) => l.includes("{{ grupo.chavePix }}"));
      expect(idx, arquivo).toBeGreaterThan(-1);
      expect(linhas[idx], arquivo).toMatch(/<span[^>]*>\s*\{\{ grupo\.chavePix \}\}\s*<\/span>/);
      const trecho = linhas.slice(Math.max(0, idx - 4), idx + 2).join("\n");
      expect(trecho, arquivo).not.toMatch(/<input|<textarea|<select|tabindex|contenteditable|readonly/);
    }
  });
});
