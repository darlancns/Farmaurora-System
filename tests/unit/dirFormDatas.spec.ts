// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { Dir, DirPatchDTO } from "../../shared/types/dir";
import DirFormModal from "../../app/components/dir/DirFormModal.vue";
import { novoDir } from "./helpers/dirFixtures";

// As 4 datas do formulário da DIR (emissão, cobrança aos fornecedores, entrega e pagamento) usam o calendário
// próprio (AppDatePicker, formato "iso"), nunca o <input type="date"> nativo. O DirFormModal REAL montado no
// happy-dom; "hoje" fixo em 07/11/2026 (dia de Brasília) trocando só hojeBrasilia.
vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-07",
}));

type Janela = Window & { happyDOM: { setViewport(v: { width: number; height: number }): void } };

const IDS = ["df-data-emissao", "df-data-cobranca", "df-data-entrega", "df-data-pagamento"] as const;

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];

interface Montado {
  atualizacoes: Array<{ id: string; payload: DirPatchDTO }>;
}

function montar(dir: Dir): Montado {
  const atualizacoes: Montado["atualizacoes"] = [];
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () =>
        h(DirFormModal, {
          editingDir: dir,
          contagemPorPo: new Map<string, number>(),
          onUpdate: (id: string, payload: DirPatchDTO) => atualizacoes.push({ id, payload }),
        }),
    }),
  );
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return { atualizacoes };
}

const campo = (id: string) => document.getElementById(id) as HTMLButtonElement;
const painel = (id: string) => document.getElementById(`${id}-calendario`);
const dia = (iso: string) => document.querySelector<HTMLButtonElement>(`[data-iso="${iso}"]`);
const acao = (nome: string) => document.querySelector<HTMLButtonElement>(`[data-acao="${nome}"]`);
const tituloDoMes = () => painel("df-data-entrega")?.querySelector("[role='grid']")?.getAttribute("aria-label") ?? "";

async function abrir(id: string): Promise<void> {
  campo(id).click();
  await nextTick();
  await nextTick();
}

async function salvar(): Promise<void> {
  document.getElementById("dir-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await nextTick();
}

beforeEach(() => {
  (window as unknown as Janela).happyDOM.setViewport({ width: 1280, height: 800 });
});

afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  document.body.style.overflow = "";
});

describe("DirFormModal — datas pelo calendário próprio", () => {
  it("nenhum <input type='date'> nativo: cada data é um botão do calendário", () => {
    montar(novoDir({ dataEmissao: "2026-10-05", dataCobrancaFornecedores: "2026-10-08" }));
    expect(document.querySelectorAll("#dir-form input[type='date']")).toHaveLength(0);
    for (const id of IDS) {
      expect(campo(id).tagName).toBe("BUTTON");
      expect(campo(id).getAttribute("aria-expanded")).toBe("false");
    }
  });

  it("mostra a data gravada (AAAA-MM-DD) como DD/MM/AAAA e o texto 'Escolher' quando vazia", () => {
    montar(novoDir({ dataEmissao: "2026-10-05", dataCobrancaFornecedores: "2026-10-08", dataEntrega: "", dataPagamento: "" }));
    expect(campo("df-data-emissao").textContent).toContain("05/10/2026");
    expect(campo("df-data-cobranca").textContent).toContain("08/10/2026");
    expect(campo("df-data-entrega").textContent).toContain("Escolher");
    expect(campo("df-data-pagamento").textContent).toContain("Escolher");
  });

  it("vazio: abre no mês de hoje (Brasília); com valor: abre no mês do valor", async () => {
    montar(novoDir({ dataEmissao: "2026-10-05", dataEntrega: "" }));

    await abrir("df-data-entrega");
    expect(tituloDoMes()).toBe("Novembro de 2026");
    expect(dia("2026-11-07")!.getAttribute("aria-current")).toBe("date");
    campo("df-data-entrega").click(); // fecha
    await nextTick();

    await abrir("df-data-emissao");
    expect(painel("df-data-emissao")!.querySelector("[role='grid']")!.getAttribute("aria-label")).toBe("Outubro de 2026");
    expect(dia("2026-10-05")!.closest("[role='gridcell']")!.getAttribute("aria-selected")).toBe("true");
  });

  it("sem limite de data: dias futuros e antigos podem ser escolhidos (como no campo nativo)", async () => {
    montar(novoDir({ dataEntrega: "" }));
    await abrir("df-data-entrega");
    expect(dia("2026-11-30")!.disabled).toBe(false);
    expect(dia("2026-11-01")!.disabled).toBe(false);
    expect(acao("hoje")!.disabled).toBe(false);
  });

  it("escolher um dia fecha o calendário, mostra a data e o servidor recebe AAAA-MM-DD", async () => {
    const m = montar(novoDir({ id: "dir_x", dataEntrega: "" }));
    await abrir("df-data-entrega");
    dia("2026-11-12")!.click();
    await nextTick();

    expect(painel("df-data-entrega")).toBeNull();
    expect(campo("df-data-entrega").textContent).toContain("12/11/2026");

    await salvar();
    expect(m.atualizacoes).toHaveLength(1);
    expect(m.atualizacoes[0]!.id).toBe("dir_x");
    expect(m.atualizacoes[0]!.payload.dataEntrega).toBe("2026-11-12");
  });

  it("'Limpar' esvazia a data: volta o texto 'Escolher' e o payload leva '' (o servidor grava NULL)", async () => {
    const m = montar(novoDir({ dataEmissao: "2026-10-05" }));
    await abrir("df-data-emissao");
    expect(acao("limpar")!.disabled).toBe(false);
    acao("limpar")!.click();
    await nextTick();

    expect(campo("df-data-emissao").textContent).toContain("Escolher");
    await salvar();
    expect(m.atualizacoes[0]!.payload.dataEmissao).toBe("");
  });

  it("'Limpar' desabilitado com a data já vazia", async () => {
    montar(novoDir({ dataPagamento: "" }));
    await abrir("df-data-pagamento");
    expect(acao("limpar")!.disabled).toBe(true);
  });

  it("datas que o usuário não mexeu seguem no payload exatamente como estavam", async () => {
    const m = montar(
      novoDir({ dataEmissao: "2026-10-05", dataCobrancaFornecedores: "2026-10-08", dataEntrega: "", dataPagamento: "" }),
    );
    await salvar();
    expect(m.atualizacoes[0]!.payload).toMatchObject({
      dataEmissao: "2026-10-05",
      dataCobrancaFornecedores: "2026-10-08",
      dataEntrega: "",
      dataPagamento: "",
    });
  });
});
