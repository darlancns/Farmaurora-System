// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import { LISTAS_CADASTRO } from "../../shared/constants/cadastros";
import type { AuthUser } from "../../shared/types/auth";
import type { Cadastro } from "../../shared/types/Cadastro";
import type { PreCadastroDaLista } from "../../shared/types/PreCadastro";
import CadastrosTab from "../../app/components/configuracoes/CadastrosTab.vue";
import { textoAprovado, textoConfirmarRejeitar, textoJaDecidido, textoRejeitado, textoVinculado } from "../../app/utils/cadastroPreMedicamentos";
import { useState } from "./helpers/nuxtAppStub";

// A seção "Pendentes de aprovação" da aba Cadastros (componentes reais no happy-dom, servidor falso em memória): estados carregando, erro e
// vazio (a seção some), o contador no título de Medicamentos, aprovar com ajustes, nome que já existe (Vincular), existente inativo, decisão
// simultânea (409), rejeitar com confirmação e o administrador como único que pede e decide. Dados fictícios (TESTE).

const BASE = { ativo: true, atualizadoPor: "", createdAt: "", updatedAt: "" };

const pre = (id: string, nome: string, extra: Partial<PreCadastroDaLista> = {}): PreCadastroDaLista => ({
  id,
  nome,
  temperatura: "2°C a 8°C",
  status: "pendente",
  compra: "Compra 07 - Novembro/2026",
  compraId: "compra_1",
  solicitadoPor: "Op Teste",
  solicitadoEm: "2026-11-12T12:30:00.000Z", // 09:30 em Brasília
  decididoPor: null,
  decididoEm: null,
  cadastroId: null,
  ...extra,
});

interface Chamada {
  metodo: string;
  url: string;
  corpo: Record<string, unknown> | null;
}
interface Servidor {
  chamadas: Chamada[];
  pendentes: PreCadastroDaLista[];
  /** Segura a resposta da lista de pendentes até ser chamada (estado "carregando"). */
  segurarLista: { liberar: () => void } | null;
  /** Respostas programadas para as próximas chamadas que casarem (metodo + trecho da url). */
  falhas: Array<{ metodo: string; trecho: string; status: number; corpo: unknown }>;
  /** Segura a resposta de um POST de decisão até ser chamada. */
  segurarDecisao: { liberar: () => void } | null;
  /** Os medicamentos devolvidos na lista de Cadastros. */
  medicamentos: Array<Record<string, unknown>>;
}
let servidor: Servidor;

const json = (corpo: unknown, status = 200): Response => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

function instalarServidor(pendentes: PreCadastroDaLista[]): void {
  servidor = { chamadas: [], pendentes, segurarLista: null, falhas: [], segurarDecisao: null, medicamentos: [{ ...BASE, id: "med_gama", nome: "TESTE MEDICAMENTO GAMA", temperatura: "Ambiente" }] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      const metodo = (opts?.method ?? "GET").toUpperCase();
      const u = String(url);
      servidor.chamadas.push({ metodo, url: u, corpo: opts?.body ? (JSON.parse(String(opts.body)) as Record<string, unknown>) : null });

      const f = servidor.falhas.findIndex((x) => x.metodo === metodo && u.includes(x.trecho));
      if (f >= 0) {
        const falha = servidor.falhas.splice(f, 1)[0]!;
        return json(falha.corpo, falha.status);
      }
      if (u.startsWith("/api/cadastros/pre-medicamentos")) {
        if (metodo === "GET") {
          if (servidor.segurarLista) await new Promise<void>((liberar) => (servidor.segurarLista!.liberar = liberar));
          return json({ status: "pendente", total: servidor.pendentes.length, itens: servidor.pendentes });
        }
        if (servidor.segurarDecisao) await new Promise<void>((liberar) => (servidor.segurarDecisao!.liberar = liberar));
        const id = /pre-medicamentos\/([\w-]+)\//.exec(u)![1]!;
        const alvo = servidor.pendentes.find((p) => p.id === id)!;
        servidor.pendentes = servidor.pendentes.filter((p) => p.id !== id);
        const aprovando = u.endsWith("/aprovar");
        return json({ preCadastro: { ...alvo, status: aprovando ? "aprovado" : "rejeitado" }, itens: 2, compras: 1, medicamentoCriado: aprovando });
      }
      if (u === "/api/cadastros/temperaturas") {
        return json([
          { ...BASE, id: "t1", nome: "2°C a 8°C" },
          { ...BASE, id: "t2", nome: "Ambiente" },
          { ...BASE, id: "t3", nome: "TESTE TEMP INATIVA", ativo: false },
        ]);
      }
      if (u === "/api/cadastros/medicamentos") return json(servidor.medicamentos);
      return json([]);
    }),
  );
}

const conta = (role: AuthUser["role"]): AuthUser => ({ id: "u1", email: "u@x.com", role, isAdmin: role === "administrador" });

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];
async function assentar(): Promise<void> {
  for (let i = 0; i < 10; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
}
async function montar(pendentes: PreCadastroDaLista[], role: AuthUser["role"] = "administrador", opcoes: { assentar?: boolean } = {}): Promise<void> {
  instalarServidor(pendentes);
  useState<AuthUser | null>("auth-user").value = conta(role);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(defineComponent({ render: () => h(CadastrosTab) }));
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  if (opcoes.assentar !== false) await assentar();
}

const texto = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const q = <T extends Element>(sel: string): T | null => document.querySelector<T>(sel);
const toast = (): string | null => useState<string | null>("toast-message").value;
const posts = (): Chamada[] => servidor.chamadas.filter((c) => c.metodo === "POST");

async function clicar(sel: string): Promise<void> {
  q<HTMLElement>(sel)!.click();
  await assentar();
}
async function digitar(sel: string, valor: string): Promise<void> {
  const input = q<HTMLInputElement>(sel)!;
  input.value = valor;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await assentar();
}
async function escolherTemperatura(id: string, nome: string): Promise<void> {
  q<HTMLButtonElement>(`#pendente-${id}-temperatura`)!.click();
  await nextTick();
  const opcao = [...document.querySelectorAll<HTMLElement>(`#pendente-${id}-temperatura-listbox [role='option']`)].find((li) => texto(li) === nome);
  opcao!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await assentar();
}

const ALFA = pre("pre_alfa", "TESTE MEDICAMENTO ALFA");
const BETA = pre("pre_beta", "TESTE MEDICAMENTO BETA", { compra: "Compra 08 - Novembro/2026", compraId: "compra_2", solicitadoPor: "Outra Pessoa", solicitadoEm: "2026-11-13T15:00:00.000Z" });

beforeEach(() => {
  useState<Record<string, Cadastro[]>>("cadastros").value = Object.fromEntries(LISTAS_CADASTRO.map((lista) => [lista, []]));
  useState<string | null>("toast-message").value = null;
});
afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a seção aparece só quando há o que decidir", () => {
  it("sem pendentes: a seção e a etiqueta do título de Medicamentos NÃO existem", async () => {
    await montar([]);
    expect(q("#cadastro-pendentes")).toBeNull();
    expect(q("#cadastro-pendentes-etiqueta-medicamentos")).toBeNull();
  });

  it("com pendentes: a seção fica ACIMA da seção de Medicamentos (e depois de Temperaturas) e a etiqueta do título conta os pendentes", async () => {
    await montar([ALFA, BETA]);
    const ids = [...document.querySelectorAll("#cadastros-tab > section")].map((s) => s.id);
    expect(ids.indexOf("cadastro-pendentes")).toBe(ids.indexOf("cadastro-secao-medicamentos") - 1);
    expect(texto(q("#cadastro-pendentes-titulo"))).toBe("Pendentes de aprovação");
    expect(texto(q("#cadastro-pendentes-contagem"))).toBe("2 pendentes");
    expect(texto(q("#cadastro-pendentes-etiqueta-medicamentos"))).toBe("2 pendentes");
    expect(q("#btn-secao-medicamentos")!.getAttribute("aria-describedby")).toContain("cadastro-pendentes-etiqueta-medicamentos");
  });

  it("singular: '1 pendente'", async () => {
    await montar([ALFA]);
    expect(texto(q("#cadastro-pendentes-etiqueta-medicamentos"))).toBe("1 pendente");
    expect(texto(q("#cadastro-pendentes-contagem"))).toBe("1 pendente");
  });

  it("cada pendente mostra nome, temperatura, a compra do pedido (sem paciente), quem pediu e quando (horário de Brasília)", async () => {
    await montar([ALFA, BETA]);
    const linha = q("#pendente-pre_alfa")!;
    expect(q<HTMLInputElement>("#pendente-pre_alfa-nome")!.value).toBe("TESTE MEDICAMENTO ALFA");
    expect(texto(q("#pendente-pre_alfa-temperatura"))).toBe("2°C a 8°C");
    expect(texto(q("#pendente-pre_alfa-meta"))).toBe("Pedido na Compra 07 - Novembro/2026 · por Op Teste em 12/11/2026 09:30");
    expect(texto(q("#pendente-pre_beta-meta"))).toBe("Pedido na Compra 08 - Novembro/2026 · por Outra Pessoa em 13/11/2026 12:00");
    expect(texto(linha)).not.toMatch(/paciente/i);
    // Do mais antigo para o mais novo.
    expect([...document.querySelectorAll("#cadastro-pendentes-lista > li")].map((li) => li.id)).toEqual(["pendente-pre_alfa", "pendente-pre_beta"]);
  });

  it("pedido sem compra: 'Pedido sem compra'", async () => {
    await montar([pre("pre_sem", "TESTE MEDICAMENTO SEM COMPRA", { compra: null, compraId: null })]);
    expect(texto(q("#pendente-pre_sem-compra"))).toBe("Pedido sem compra");
  });

  it("carregando: 'Carregando…' até a lista chegar", async () => {
    instalarServidor([ALFA]);
    servidor.segurarLista = { liberar: () => undefined };
    useState<AuthUser | null>("auth-user").value = conta("administrador");
    const el = document.createElement("div");
    document.body.appendChild(el);
    const app = createApp(defineComponent({ render: () => h(CadastrosTab) }));
    app.mount(el);
    montados.push({ unmount: () => app.unmount(), el });
    await assentar();
    expect(texto(q("#cadastro-pendentes-carregando"))).toBe("Carregando…");
    expect(q("#cadastro-pendentes-lista")).toBeNull();
    servidor.segurarLista.liberar();
    await assentar();
    expect(q("#cadastro-pendentes-carregando")).toBeNull();
    expect(q("#cadastro-pendentes-lista")).not.toBeNull();
  });

  it("erro ao carregar: a mensagem e 'Tentar de novo', que relê e mostra a lista", async () => {
    instalarServidor([ALFA]);
    servidor.falhas.push({ metodo: "GET", trecho: "pre-medicamentos", status: 500, corpo: { statusMessage: "Servidor fora do ar." } });
    useState<AuthUser | null>("auth-user").value = conta("administrador");
    const el = document.createElement("div");
    document.body.appendChild(el);
    const app = createApp(defineComponent({ render: () => h(CadastrosTab) }));
    app.mount(el);
    montados.push({ unmount: () => app.unmount(), el });
    await assentar();
    expect(texto(q("#cadastro-pendentes-erro"))).toContain("Servidor fora do ar.");
    expect(q("#cadastro-pendentes-lista")).toBeNull();
    await clicar("#btn-pendentes-recarregar");
    expect(q("#cadastro-pendentes-erro")).toBeNull();
    expect(q("#pendente-pre_alfa")).not.toBeNull();
  });
});

describe("só o administrador pede e decide", () => {
  it("quem não escreve nos Cadastros: nem pede a lista de pendentes e a seção não existe", async () => {
    await montar([ALFA], "socio");
    expect(servidor.chamadas.some((c) => c.url.includes("pre-medicamentos"))).toBe(false);
    expect(q("#cadastro-pendentes")).toBeNull();
    expect(q("#cadastro-pendentes-etiqueta-medicamentos")).toBeNull();
  });
});

describe("aprovar", () => {
  it("clicar em Aprovar envia nome e temperatura do pedido, tira o pendente, atualiza o contador, avisa e relê os Medicamentos", async () => {
    await montar([ALFA, BETA]);
    servidor.chamadas.length = 0;
    await clicar("#btn-pendente-aprovar-pre_alfa");
    expect(posts()).toEqual([{ metodo: "POST", url: "/api/cadastros/pre-medicamentos/pre_alfa/aprovar", corpo: { nome: "TESTE MEDICAMENTO ALFA", temperatura: "2°C a 8°C" } }]);
    expect(q("#pendente-pre_alfa")).toBeNull();
    expect(texto(q("#cadastro-pendentes-etiqueta-medicamentos"))).toBe("1 pendente");
    expect(toast()).toBe(textoAprovado("TESTE MEDICAMENTO ALFA", 2));
    expect(servidor.chamadas.some((c) => c.metodo === "GET" && c.url === "/api/cadastros/medicamentos")).toBe(true);
  });

  it("o último pendente aprovado: a seção e a etiqueta somem", async () => {
    await montar([ALFA]);
    await clicar("#btn-pendente-aprovar-pre_alfa");
    expect(q("#cadastro-pendentes")).toBeNull();
    expect(q("#cadastro-pendentes-etiqueta-medicamentos")).toBeNull();
  });

  it("o aprovador ajusta o nome (vira MAIÚSCULAS) e a temperatura (só as ATIVAS são oferecidas) antes de aprovar", async () => {
    await montar([ALFA]);
    await digitar("#pendente-pre_alfa-nome", "teste medicamento alfa 5 mg");
    expect(q<HTMLInputElement>("#pendente-pre_alfa-nome")!.value).toBe("TESTE MEDICAMENTO ALFA 5 MG");
    q<HTMLButtonElement>("#pendente-pre_alfa-temperatura")!.click();
    await nextTick();
    expect([...document.querySelectorAll("#pendente-pre_alfa-temperatura-listbox [role='option']")].map((li) => texto(li))).toEqual(["Selecione", "2°C a 8°C", "Ambiente"]);
    q<HTMLButtonElement>("#pendente-pre_alfa-temperatura")!.click(); // fecha
    await escolherTemperatura("pre_alfa", "Ambiente");
    await clicar("#btn-pendente-aprovar-pre_alfa");
    expect(posts()[0]!.corpo).toEqual({ nome: "TESTE MEDICAMENTO ALFA 5 MG", temperatura: "Ambiente" });
  });

  it("nome vazio ou sem temperatura: Aprovar fica desabilitado (e a sem temperatura explica)", async () => {
    await montar([pre("pre_sem_temp", "TESTE MEDICAMENTO SEM TEMP", { temperatura: "" })]);
    expect(q<HTMLButtonElement>("#btn-pendente-aprovar-pre_sem_temp")!.disabled).toBe(true);
    expect(texto(q("#pendente-pre_sem_temp-sem-temperatura"))).toBe("Escolha a temperatura para aprovar.");
    await escolherTemperatura("pre_sem_temp", "Ambiente");
    expect(q<HTMLButtonElement>("#btn-pendente-aprovar-pre_sem_temp")!.disabled).toBe(false);
    await digitar("#pendente-pre_sem_temp-nome", "   ");
    expect(q<HTMLButtonElement>("#btn-pendente-aprovar-pre_sem_temp")!.disabled).toBe(true);
    q<HTMLButtonElement>("#btn-pendente-aprovar-pre_sem_temp")!.click();
    await assentar();
    expect(posts()).toEqual([]);
  });

  it("clique duplo: UM só POST (a linha fica ocupada) e os botões ficam desabilitados enquanto espera", async () => {
    await montar([ALFA]);
    servidor.segurarDecisao = { liberar: () => undefined };
    q<HTMLButtonElement>("#btn-pendente-aprovar-pre_alfa")!.click();
    await assentar();
    expect(q<HTMLButtonElement>("#btn-pendente-aprovar-pre_alfa")!.disabled).toBe(true);
    expect(q<HTMLButtonElement>("#btn-pendente-rejeitar-pre_alfa")!.disabled).toBe(true);
    expect(texto(q("#btn-pendente-aprovar-pre_alfa"))).toBe("Aguarde…");
    q<HTMLButtonElement>("#btn-pendente-aprovar-pre_alfa")!.click();
    await assentar();
    servidor.segurarDecisao.liberar();
    await assentar();
    expect(posts()).toHaveLength(1);
  });

  it("422 do servidor: a mensagem aparece NA linha, o pendente continua e o botão volta", async () => {
    await montar([ALFA]);
    servidor.falhas.push({ metodo: "POST", trecho: "/aprovar", status: 422, corpo: { statusMessage: "Essa temperatura está inativa. Escolha uma temperatura ativa." } });
    await clicar("#btn-pendente-aprovar-pre_alfa");
    expect(texto(q("#pendente-pre_alfa-erro"))).toBe("Essa temperatura está inativa. Escolha uma temperatura ativa.");
    expect(q("#pendente-pre_alfa")).not.toBeNull();
    expect(q<HTMLButtonElement>("#btn-pendente-aprovar-pre_alfa")!.disabled).toBe(false);
  });
});

describe("nome que já existe no Cadastro", () => {
  const conflitoAtivo = { metodo: "POST", trecho: "/aprovar", status: 409, corpo: { statusMessage: "Já existe um medicamento com esse nome no Cadastro.", data: { code: "medicamento_ja_cadastrado", existente: { id: "med_gama", nome: "TESTE MEDICAMENTO GAMA", temperatura: "Ambiente", ativo: true } } } };

  it("409: mostra 'Já existe no Cadastro: X' e o botão 'Vincular ao cadastro existente'; nada sai da lista", async () => {
    await montar([ALFA]);
    servidor.falhas.push(conflitoAtivo);
    await clicar("#btn-pendente-aprovar-pre_alfa");
    expect(texto(q("#pendente-pre_alfa-conflito-texto"))).toBe("Já existe no Cadastro: TESTE MEDICAMENTO GAMA (Ambiente)");
    expect(texto(q("#btn-pendente-vincular-pre_alfa"))).toBe("Vincular ao cadastro existente");
    expect(q("#pendente-pre_alfa")).not.toBeNull();
    expect(q("#pendente-pre_alfa-conflito")!.getAttribute("role")).toBe("alert");
  });

  it("Vincular envia o nome com vincularExistente (não cria linha nova), liga e tira o pendente", async () => {
    await montar([ALFA]);
    servidor.falhas.push(conflitoAtivo);
    await clicar("#btn-pendente-aprovar-pre_alfa");
    await clicar("#btn-pendente-vincular-pre_alfa");
    expect(posts().at(-1)).toEqual({ metodo: "POST", url: "/api/cadastros/pre-medicamentos/pre_alfa/aprovar", corpo: { nome: "TESTE MEDICAMENTO ALFA", vincularExistente: true } });
    expect(q("#pendente-pre_alfa")).toBeNull();
    expect(toast()).toBe(textoVinculado("TESTE MEDICAMENTO ALFA", 2));
  });

  it("mudar o nome limpa o aviso (a pessoa pode aprovar com outro nome)", async () => {
    await montar([ALFA]);
    servidor.falhas.push(conflitoAtivo);
    await clicar("#btn-pendente-aprovar-pre_alfa");
    expect(q("#pendente-pre_alfa-conflito")).not.toBeNull();
    await digitar("#pendente-pre_alfa-nome", "TESTE MEDICAMENTO ALFA 10 MG");
    expect(q("#pendente-pre_alfa-conflito")).toBeNull();
  });

  it("existente INATIVO: diz que está inativo e NÃO oferece vincular", async () => {
    await montar([ALFA]);
    servidor.falhas.push({ ...conflitoAtivo, corpo: { statusMessage: "x", data: { code: "medicamento_ja_cadastrado", existente: { id: "med_delta", nome: "TESTE MEDICAMENTO DELTA", temperatura: "Ambiente", ativo: false } } } });
    await clicar("#btn-pendente-aprovar-pre_alfa");
    expect(texto(q("#pendente-pre_alfa-conflito-texto"))).toContain("está inativo: TESTE MEDICAMENTO DELTA");
    expect(q("#btn-pendente-vincular-pre_alfa")).toBeNull();
    expect(q("#pendente-pre_alfa-conflito")!.getAttribute("data-conflito")).toBe("inativo");
  });
});

describe("rejeitar", () => {
  it("pede confirmação ANTES de enviar: abrir e cancelar não envia nada", async () => {
    await montar([ALFA]);
    await clicar("#btn-pendente-rejeitar-pre_alfa");
    expect(document.body.textContent).toContain(textoConfirmarRejeitar("TESTE MEDICAMENTO ALFA"));
    expect(posts()).toEqual([]);
    const cancelar = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => texto(b) === "Cancelar")!;
    cancelar.click();
    await assentar();
    expect(posts()).toEqual([]);
    expect(q("#pendente-pre_alfa")).not.toBeNull();
  });

  it("confirmar envia o POST de rejeitar (sem corpo), tira o pendente e avisa", async () => {
    await montar([ALFA]);
    await clicar("#btn-pendente-rejeitar-pre_alfa");
    const confirmar = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => texto(b) === "Rejeitar" && b.id !== "btn-pendente-rejeitar-pre_alfa")!;
    confirmar.click();
    await assentar();
    expect(posts()).toEqual([{ metodo: "POST", url: "/api/cadastros/pre-medicamentos/pre_alfa/rejeitar", corpo: null }]);
    expect(q("#pendente-pre_alfa")).toBeNull();
    expect(toast()).toBe(textoRejeitado("TESTE MEDICAMENTO ALFA"));
    // Rejeitar não mexe nos Medicamentos do Cadastro.
    expect(servidor.chamadas.filter((c) => c.metodo === "GET" && c.url === "/api/cadastros/medicamentos")).toHaveLength(1); // só a leitura inicial
  });
});

// FICA POR ÚLTIMO: o aviso da decisão simultânea é "protegido" (dura 8 s e o toast seguinte espera na fila), e o agendador de toasts é um só por módulo;
// qualquer teste que viesse depois e conferisse o toast ficaria esperando o aviso sair.
describe("decisão simultânea (409 pre_cadastro_ja_decidido)", () => {
  it("avisa o que a outra pessoa decidiu e atualiza a lista (o pendente some)", async () => {
    await montar([ALFA, BETA]);
    servidor.pendentes = [BETA];
    servidor.falhas.push({ metodo: "POST", trecho: "/aprovar", status: 409, corpo: { statusMessage: "Este pré-cadastro já foi decidido por outra pessoa.", data: { code: "pre_cadastro_ja_decidido", status: "rejeitado", preCadastro: { ...ALFA, status: "rejeitado" } } } });
    await clicar("#btn-pendente-aprovar-pre_alfa");
    expect(toast()).toBe(textoJaDecidido("rejeitado"));
    expect(q("#pendente-pre_alfa")).toBeNull();
    expect(q("#pendente-pre_beta")).not.toBeNull();
    expect(texto(q("#cadastro-pendentes-etiqueta-medicamentos"))).toBe("1 pendente");
  });
});
