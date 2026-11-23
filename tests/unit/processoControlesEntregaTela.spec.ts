// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { Processo } from "#shared/types/processo";
import ProcessoDeliveredList from "../../app/components/processos/ProcessoDeliveredList.vue";
import ProcessoDetail from "../../app/components/processos/ProcessoDetail.vue";
import ProcessoKanbanCard from "../../app/components/processos/ProcessoKanbanCard.vue";
import ProcessoPainel from "../../app/components/processos/ProcessoPainel.vue";
import { controlesEntregaParaTela } from "../../app/utils/processoControlesEntrega";
import { dataEntregaOuPrevisao } from "../../app/utils/processoDataEntregaLista";
import { ICONES_CARD, ICONES_ESTADO } from "../../app/utils/processoIcones";
import { linhasInfoKanban } from "../../app/utils/processoKanbanInfo";
import { camposDatas, camposDatasPreenchidos } from "../../app/utils/processoPainel";
import { secaoEntrega, secaoEnvio } from "../../app/utils/processoPainelSecoes";
import { camposPesquisaveis, criarTermoBusca, filtrarPorBusca, processoCombinaBusca } from "../../app/utils/processoBusca";

// Etapa 5 da regra "Entregue": data de entrega e controles (Pagamento da transportadora, DIR e Protocolo) no card do Kanban, no
// painel, no detalhe/aba Entregues da Lista e na busca. Regra única: app/utils/processoControlesEntrega.ts.

function proc(extra: Partial<Processo> = {}): Processo {
  return {
    id: "p1",
    paciente: "Maria Aparecida",
    numeroRemessa: 1,
    pasta: "2026 - 366",
    numeroPo: "PO-26-0471",
    empresa: "FARMAURORA",
    consultor: "Dani",
    responsavelOperacional: "Rebeca",
    fornecedor: "Poros - Turquia",
    modalEnvio: "Air Cargo",
    companhiaAerea: "Lufthansa",
    numeroAwb: "957-12345678",
    despachante: "Marcelo Lima",
    transportadoraNacional: { nome: "AJC", cotacao: "COT-9", valor: 1500 },
    localEntrega: "Clínica X",
    medicamentos: [{ nome: "PEMBROLIZUMABE", quantidade: "4 cx" }],
    status: "entregue",
    datas: { previsaoEntrega: "28/08", dataEntrega: "2026-11-20" },
    pendencias: [],
    atualizacoes: [],
    createdAt: "",
    updatedAt: "v1",
    ...extra,
  };
}

const AIR_AJC = { pagamentoTransportadora: "pendente" } as const;
const SIMPLES = { modalEnvio: "Courier Simples", transportadoraNacional: undefined } as const;
const FORMAL = { modalEnvio: "Courier Formal" } as const;

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
  vi.restoreAllMocks();
});
const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const card = (p: Processo) => montar(defineComponent({ render: () => h(ProcessoKanbanCard, { processo: p }) }));
const painel = (p: Processo) => montar(defineComponent({ render: () => h(ProcessoPainel, { processo: p, contagemPasta: new Map() }) }));
const detalhe = (p: Processo) => montar(defineComponent({ render: () => h(ProcessoDetail, { processo: p }) }));

describe("controlesEntregaParaTela (regra única)", () => {
  it("Air Cargo + AJC: 'AJC pendente' (pendente) e 'AJC pago' (concluído); o nome vem do nome canônico", () => {
    expect(controlesEntregaParaTela(proc({ ...AIR_AJC }))).toEqual([
      { chave: "pagamento", texto: "AJC pendente", estado: "pendente", rotulo: "Pagamento da transportadora" },
    ]);
    expect(controlesEntregaParaTela(proc({ pagamentoTransportadora: "pago", transportadoraNacional: { nome: " doctor transportes " } }))[0]).toMatchObject({
      texto: "Doctor pago",
      estado: "concluido",
    });
  });

  it("Courier Simples: DIR pendente (Pegar DIR e Protocolo) e concluídos (DIR no Drive, DIR e Protocolo); sem Pagamento mesmo com AJC gravado", () => {
    const base = { ...SIMPLES, pagamentoTransportadora: "pendente" as const };
    expect(controlesEntregaParaTela(proc({ ...base, dirProtocolo: "pegar_dir_protocolo" }))).toEqual([
      { chave: "dir", texto: "Pegar DIR e Protocolo", estado: "pendente", rotulo: "DIR e Protocolo" },
    ]);
    expect(controlesEntregaParaTela(proc({ ...base, dirProtocolo: "dir_no_drive" }))[0]).toMatchObject({ texto: "DIR no Drive", estado: "concluido" });
    expect(controlesEntregaParaTela(proc({ ...base, dirProtocolo: "dir_protocolo" }))[0]).toMatchObject({ texto: "DIR e Protocolo", estado: "concluido" });
    expect(controlesEntregaParaTela(proc({ ...SIMPLES, transportadoraNacional: { nome: "AJC" }, pagamentoTransportadora: "pago" }))).toEqual([]);
  });

  it("Courier Formal + AJC: os dois, Pagamento primeiro; o Formal nunca mostra 'DIR e Protocolo' nem 'Pegar DIR e Protocolo'", () => {
    const lista = controlesEntregaParaTela(proc({ ...FORMAL, ...AIR_AJC, dirProtocolo: "dir_no_drive" }));
    expect(lista.map((c) => c.texto)).toEqual(["AJC pendente", "DIR no Drive"]);
    expect(controlesEntregaParaTela(proc({ ...FORMAL, dirProtocolo: "pegar_dir" }))[0]).toMatchObject({ texto: "Pegar DIR", estado: "pendente" });
    expect(controlesEntregaParaTela(proc({ ...FORMAL, transportadoraNacional: undefined, dirProtocolo: "dir_protocolo" }))).toEqual([]);
    expect(controlesEntregaParaTela(proc({ ...FORMAL, transportadoraNacional: undefined, dirProtocolo: "pegar_dir_protocolo" }))).toEqual([]);
  });

  it("fora de Entregue, sem valor (Entregue antigo), Air Cargo com DIR gravado e transportadora que não é AJC/Doctor: nada", () => {
    for (const status of ["elaboracao_fornecedores", "em_transito", "desembaraco", "liberado"] as const) {
      expect(controlesEntregaParaTela(proc({ status, ...AIR_AJC })), status).toEqual([]);
    }
    expect(controlesEntregaParaTela(proc({}))).toEqual([]);
    expect(controlesEntregaParaTela(proc({ dirProtocolo: "dir_no_drive" }))).toEqual([]); // Air Cargo não tem DIR
    expect(controlesEntregaParaTela(proc({ transportadoraNacional: { nome: "Braspress" }, pagamentoTransportadora: "pago" }))).toEqual([]);
  });
});

describe("linhasInfoKanban: data de entrega e linha de controles", () => {
  const aereo = (p: Processo) => linhasInfoKanban(p).find((l) => l.chave === "aereo")!;

  it("Entregue com data de entrega: mostra ela (DD/MM, fixa, title 'Entregue em DD/MM/AAAA'), no lugar da previsão", () => {
    const celula = aereo(proc()).celulas[1]!;
    expect(celula).toMatchObject({ chave: "entrega", texto: "20/11", titulo: "Entregue em 20/11/2026", fixa: true });
    expect(aereo(proc()).celulas.some((c) => c.chave === "previsao")).toBe(false);
  });

  it("Entregue SEM data de entrega (antigo), data de entrega inválida e qualquer outro status: a previsão, como hoje", () => {
    for (const p of [
      proc({ datas: { previsaoEntrega: "28/08" } }),
      proc({ datas: { previsaoEntrega: "28/08", dataEntrega: "2026-02-31" } }),
      proc({ status: "liberado" }),
      proc({ status: "em_transito", datas: { previsaoEntrega: "28/08/2026", dataEntrega: "2026-11-20" } }),
    ]) {
      expect(aereo(p).celulas[1], p.status).toMatchObject({ chave: "previsao", texto: "28/08" });
    }
  });

  it("sem Cia e sem AWB, a data de entrega aparece sozinha no bloquinho", () => {
    const l = aereo(proc({ companhiaAerea: undefined, numeroAwb: undefined }));
    expect(l.celulas.map((c) => c.chave)).toEqual(["entrega"]);
  });

  it("linha 'controles' depois da aérea, só em Entregue e só com valor", () => {
    expect(linhasInfoKanban(proc({ ...AIR_AJC })).map((l) => l.chave)).toEqual(["pessoas", "origem", "aereo", "controles"]);
    expect(linhasInfoKanban(proc({})).map((l) => l.chave)).toEqual(["pessoas", "origem", "aereo"]); // Entregue antigo
    expect(linhasInfoKanban(proc({ status: "liberado", ...AIR_AJC })).map((l) => l.chave)).toEqual(["pessoas", "origem", "aereo"]);
  });

  it("células: pagamento e DIR lado a lado; o estado vai no texto, no ícone (estado) e no title", () => {
    const l = linhasInfoKanban(proc({ ...FORMAL, ...AIR_AJC, dirProtocolo: "dir_no_drive" })).find((x) => x.chave === "controles")!;
    expect(l.celulas.map((c) => [c.chave, c.texto, c.estado])).toEqual([
      ["controle-pagamento", "AJC pendente", "pendente"],
      ["controle-dir", "DIR no Drive", "concluido"],
    ]);
    expect(l.celulas[0]!.titulo).toBe("Pagamento da transportadora: AJC pendente");
    expect(l.celulas[1]!.titulo).toBe("DIR e Protocolo: DIR no Drive");
  });

  it("sem os campos do Entregue (objeto antigo, só os do card): o card é o de sempre", () => {
    const l = linhasInfoKanban({ responsavelOperacional: "R", consultor: "C", pendencias: [], fornecedor: "F", companhiaAerea: "LATAM", numeroAwb: "1", datas: { previsaoEntrega: "25/11" } });
    expect(l.map((x) => x.chave)).toEqual(["pessoas", "origem", "aereo"]);
  });
});

describe("ICONES_ESTADO", () => {
  it("relógio e check em círculo, em registro separado; ICONES_CARD continua com os 6 de sempre", () => {
    expect(ICONES_ESTADO.pendente).toContain("M12 6v6l4 2");
    expect(ICONES_ESTADO.concluido).toEqual(["M21.801 10A10 10 0 1 1 17 3.335", "m9 11 3 3L22 4"]);
    expect(Object.keys(ICONES_CARD)).toEqual(["responsavel", "consultor", "pendencias", "fornecedor", "despachante", "aereo"]);
  });
});

describe("ProcessoKanbanCard: renderização", () => {
  it("data de entrega ao lado do AWB: 'DD/MM', sem ícone, nowrap, com title", () => {
    const el = card(proc({ ...AIR_AJC }));
    const c = el.querySelector<HTMLElement>("#card-entrega-p1")!;
    expect(texto(c)).toBe("Data de entrega: 20/11");
    expect(c.getAttribute("title")).toBe("Entregue em 20/11/2026");
    expect(c.className).toContain("flex-none");
    expect(c.querySelector("svg")).toBeNull();
    expect(c.querySelector(".whitespace-nowrap")).not.toBeNull();
    expect(el.querySelector("#card-previsao-p1")).toBeNull();
  });

  it("controle pendente: âmbar #7a5a12 com relógio; texto com o nome ('AJC pendente'), min-w-0 + truncate + title", () => {
    const el = card(proc({ ...AIR_AJC }));
    const c = el.querySelector<HTMLElement>("#card-controle-pagamento-p1")!;
    expect(texto(c)).toBe("Pagamento da transportadora: AJC pendente");
    expect(c.className).toContain("text-[#7a5a12]");
    expect(c.className).toContain("min-w-0");
    expect(c.getAttribute("title")).toBe("Pagamento da transportadora: AJC pendente");
    const svg = c.querySelector("svg")!;
    expect(svg.getAttribute("class")).toContain("h-3.5 w-3.5");
    expect(svg.getAttribute("stroke-width")).toBe("1.6");
    expect([...svg.querySelectorAll("path")].map((p) => p.getAttribute("d"))).toEqual(ICONES_ESTADO.pendente);
    expect(c.querySelector(".truncate")).not.toBeNull();
    expect(el.querySelector("#card-info-controles-p1")).not.toBeNull();
  });

  it("controle concluído: verde #1d6234 com check em círculo; DIR e Pagamento na MESMA linha", () => {
    const el = card(proc({ ...FORMAL, pagamentoTransportadora: "pago", dirProtocolo: "dir_no_drive" }));
    const linha = el.querySelector<HTMLElement>("#card-info-controles-p1")!;
    expect([...linha.children].map((c) => c.id)).toEqual(["card-controle-pagamento-p1", "card-controle-dir-p1"]);
    const pg = linha.querySelector<HTMLElement>("#card-controle-pagamento-p1")!;
    const dir = linha.querySelector<HTMLElement>("#card-controle-dir-p1")!;
    expect(pg.className).toContain("text-[#1d6234]");
    expect(dir.className).toContain("text-[#1d6234]");
    expect([...dir.querySelectorAll("path")].map((p) => p.getAttribute("d"))).toEqual(ICONES_ESTADO.concluido);
    expect(texto(dir)).toBe("DIR e Protocolo: DIR no Drive");
    expect(linha.className).toContain("divide-x");
  });

  it("Entregue antigo: mostra a previsão e NENHUMA linha nova; fora de Entregue: nenhuma linha de controles nem data de entrega", () => {
    const antigo = card(proc({ datas: { previsaoEntrega: "28/08" } }));
    expect(texto(antigo.querySelector("#card-previsao-p1"))).toBe("Previsão de entrega: 28/08");
    expect(antigo.querySelector("#card-info-controles-p1")).toBeNull();
    expect(antigo.querySelector("#card-entrega-p1")).toBeNull();

    const fora = card(proc({ status: "liberado", ...AIR_AJC, dirProtocolo: "dir_no_drive" }));
    expect(fora.querySelector("#card-info-controles-p1")).toBeNull();
    expect(fora.querySelector("#card-entrega-p1")).toBeNull();
    expect(texto(fora.querySelector("#card-previsao-p1"))).toBe("Previsão de entrega: 28/08");
  });

  it("o selo Pago/Pendente do FORNECEDOR segue no topo e não se confunde com o controle", () => {
    const el = card(proc({ ...AIR_AJC, statusPagamento: "pago" }));
    expect(texto(el.querySelector("#card-pagamento-p1"))).toBe("Pago");
    expect(texto(el.querySelector("#card-controle-pagamento-p1"))).toContain("AJC pendente");
  });
});

describe("painel", () => {
  it("camposDatas: 'Data de entrega' logo depois de Registro Lpco, em DD/MM/AAAA", () => {
    const ids = camposDatas(proc()).map((c) => c.id);
    expect(ids.indexOf("data-entrega")).toBe(ids.indexOf("registro-lpco") + 1);
    expect(camposDatas(proc()).find((c) => c.id === "data-entrega")).toMatchObject({ rotulo: "Data de entrega", valor: "20/11/2026" });
    // vazia não aparece (preenchidos): o Entregue antigo e os outros status sem a data
    expect(camposDatasPreenchidos(proc({ datas: {} })).some((c) => c.id === "data-entrega")).toBe(false);
  });

  it("secaoEntrega: Pagamento da transportadora entre a Transportadora e o Local, só em Entregue com valor", () => {
    const s = secaoEntrega(proc({ ...AIR_AJC }))!;
    expect(s.linhas.map((l) => l.map((c) => c.id))).toEqual([["painel-transportadora"], ["painel-pagamento-transportadora"], ["painel-local-entrega"]]);
    expect(s.linhas[1]![0]).toMatchObject({ rotulo: "Pagamento da transportadora", valor: "AJC pendente", estado: "pendente" });
    expect(secaoEntrega(proc({}))!.linhas.flat().some((c) => c.id === "painel-pagamento-transportadora")).toBe(false);
    expect(secaoEntrega(proc({ status: "liberado", ...AIR_AJC }))!.linhas.flat().some((c) => c.estado)).toBe(false);
  });

  it("secaoEnvio: o DIR numa LINHA NOVA; a linha [AWB, Despachante] continua com 2 células", () => {
    const s = secaoEnvio(proc({ ...FORMAL, dirProtocolo: "pegar_dir" }))!;
    expect(s.linhas.map((l) => l.map((c) => c.id))).toEqual([
      ["painel-envio", "painel-cia"],
      ["painel-awb", "painel-despachante"],
      ["painel-dir-protocolo"],
    ]);
    expect(s.linhas[2]![0]).toMatchObject({ rotulo: "DIR e Protocolo", valor: "Pegar DIR", estado: "pendente" });
    expect(secaoEnvio(proc({ ...FORMAL }))!.linhas).toHaveLength(2); // sem valor, sem linha
    expect(secaoEnvio(proc({ ...FORMAL, status: "liberado", dirProtocolo: "pegar_dir" }))!.linhas).toHaveLength(2);
  });

  it("componente: data de entrega nas Datas e os dois controles, com cor e ícone de estado", () => {
    const el = painel(proc({ ...FORMAL, pagamentoTransportadora: "pago", dirProtocolo: "pegar_dir" }));
    expect(texto(el.querySelector("#painel-data-entrega"))).toBe("20/11/2026");
    const pg = el.querySelector<HTMLElement>("#painel-pagamento-transportadora")!;
    const dir = el.querySelector<HTMLElement>("#painel-dir-protocolo")!;
    expect(texto(pg)).toBe("AJC pago");
    expect(pg.className).toContain("text-[#1d6234]");
    expect(texto(dir)).toBe("Pegar DIR");
    expect(dir.className).toContain("text-[#7a5a12]");
    expect([...dir.closest("div[title]")!.querySelectorAll("path")].map((p) => p.getAttribute("d"))).toEqual(ICONES_ESTADO.pendente);
    expect(el.querySelector("#painel-bloco-envio")!.contains(dir)).toBe(true);
    expect(el.querySelector("#painel-bloco-entrega")!.contains(pg)).toBe(true);
  });

  it("componente: Entregue antigo e outros status não mostram controles nem data de entrega", () => {
    const antigo = painel(proc({ datas: {} }));
    expect(antigo.querySelector("#painel-data-entrega")).toBeNull();
    expect(antigo.querySelector("#painel-pagamento-transportadora")).toBeNull();
    expect(antigo.querySelector("#painel-dir-protocolo")).toBeNull();
  });
});

describe("detalhe da Lista (ProcessoDetail)", () => {
  it("mostra a Data de entrega (de camposDatas) e os controles, também no modo readonly", () => {
    for (const readonly of [false, true]) {
      const p = proc({ ...FORMAL, pagamentoTransportadora: "pendente", dirProtocolo: "dir_no_drive" });
      const el = montar(defineComponent({ render: () => h(ProcessoDetail, { processo: p, readonly }) }));
      expect(texto(el.querySelector("#processo-detail-datas-p1"))).toContain("Data de entrega20/11/2026");
      const pg = el.querySelector<HTMLElement>("#detalhe-pagamento-transportadora-p1")!;
      const dir = el.querySelector<HTMLElement>("#detalhe-dir-protocolo-p1")!;
      expect(texto(pg)).toBe("AJC pendente");
      expect(pg.className).toContain("text-[#7a5a12]");
      expect(texto(dir)).toBe("DIR no Drive");
      expect(dir.className).toContain("text-[#1d6234]");
      expect(texto(pg.parentElement)).toContain("Pagamento da transportadora");
      expect(texto(dir.parentElement)).toContain("DIR e Protocolo");
    }
  });

  it("Entregue antigo e outros status: nenhum controle", () => {
    const el = detalhe(proc({ status: "liberado", ...AIR_AJC }));
    expect(el.querySelector("#detalhe-pagamento-transportadora-p1")).toBeNull();
    expect(el.querySelector("#detalhe-dir-protocolo-p1")).toBeNull();
  });
});

describe("aba Entregues: coluna da data", () => {
  const lista = (processos: Processo[]) => montar(defineComponent({ render: () => h(ProcessoDeliveredList, { processos }) }));

  it("dataEntregaOuPrevisao: entrega (dd/mm/aaaa) quando houver; senão a previsão; senão '—'", () => {
    expect(dataEntregaOuPrevisao(proc())).toEqual({ tipo: "entrega", texto: "20/11/2026", titulo: "Entregue em 20/11/2026" });
    expect(dataEntregaOuPrevisao(proc({ datas: { previsaoEntrega: "28/08" } }))).toEqual({
      tipo: "previsao",
      texto: "28/08",
      titulo: "Previsão de entrega: 28/08",
    });
    expect(dataEntregaOuPrevisao(proc({ datas: {} })).texto).toBe("—");
  });

  it("mostra a data de entrega com title e leitor de tela; sem ela, a previsão", () => {
    const el = lista([proc({ id: "a" }), proc({ id: "b", datas: { previsaoEntrega: "28/08" } })]);
    const a = el.querySelector<HTMLElement>("#entregue-data-a")!;
    expect(texto(a)).toBe("Entregue em 20/11/2026");
    expect(a.getAttribute("title")).toBe("Entregue em 20/11/2026");
    const b = el.querySelector<HTMLElement>("#entregue-data-b")!;
    expect(texto(b)).toBe("Previsão de entrega: 28/08");
    expect(b.getAttribute("title")).toBe("Previsão de entrega: 28/08");
  });

  it("a ordenação continua por PREVISÃO (não pela data de entrega)", () => {
    const el = lista([
      proc({ id: "tarde", datas: { previsaoEntrega: "20/12", dataEntrega: "2026-01-02" } }),
      proc({ id: "cedo", datas: { previsaoEntrega: "10/01", dataEntrega: "2026-12-30" } }),
    ]);
    const ids = [...el.querySelectorAll("[id^='entregue-data-']")].map((n) => n.id.replace("entregue-data-", ""));
    expect(ids).toEqual(["cedo", "tarde"]);
  });

  it("expandir um item mostra os controles no detalhe", async () => {
    const el = lista([proc({ id: "a", ...AIR_AJC })]);
    el.querySelector<HTMLButtonElement>("#btn-toggle-entregue-a")!.click();
    await nextTick();
    expect(texto(el.querySelector("#detalhe-pagamento-transportadora-a"))).toBe("AJC pendente");
  });
});

describe("busca", () => {
  const achar = (p: Processo, termo: string) => processoCombinaBusca(p, criarTermoBusca(termo)!);

  it("acha pelo rótulo completo dos controles (só em Entregue, só aplicável e com valor)", () => {
    const p = proc({ ...FORMAL, ...AIR_AJC, dirProtocolo: "pegar_dir" });
    expect(camposPesquisaveis(p)).toContain("ajc pendente");
    expect(camposPesquisaveis(p)).toContain("pegar dir");
    expect(achar(p, "ajc pendente")).toBe(true);
    expect(achar(proc({ pagamentoTransportadora: "pago", transportadoraNacional: { nome: "Doctor" } }), "doctor pago")).toBe(true);
    expect(achar(proc({ ...SIMPLES, dirProtocolo: "pegar_dir_protocolo" }), "pegar dir e protocolo")).toBe(true);
    expect(achar(proc({ ...SIMPLES, dirProtocolo: "dir_no_drive" }), "dir no drive")).toBe(true);
  });

  it("não acha o que não aparece na tela: fora de Entregue, inaplicável ou sem valor", () => {
    expect(camposPesquisaveis(proc({ status: "liberado", ...AIR_AJC }))).not.toContain("ajc pendente");
    expect(achar(proc({ status: "liberado", ...AIR_AJC }), "doctor")).toBe(false);
    expect(camposPesquisaveis(proc({ dirProtocolo: "dir_no_drive" }))).not.toContain("dir no drive"); // Air Cargo
    expect(achar(proc({ dirProtocolo: "dir_no_drive" }), "drive")).toBe(false);
    expect(camposPesquisaveis(proc({}))).not.toContain("ajc pendente"); // Entregue antigo
  });

  it("filtrarPorBusca: 'drive' só traz os entregues com DIR no Drive; datas continuam fora da busca", () => {
    const a = proc({ id: "a", ...SIMPLES, dirProtocolo: "dir_no_drive" });
    const b = proc({ id: "b", ...SIMPLES, dirProtocolo: "pegar_dir_protocolo" });
    expect(filtrarPorBusca([a, b], "drive").map((p) => p.id)).toEqual(["a"]);
    expect(filtrarPorBusca([a, b], "2026-11-20")).toEqual([]);
    expect(filtrarPorBusca([a, b], "20/11/2026")).toEqual([]);
  });
});
