import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreCadastroDaLista, RespostaDecisaoPreCadastro } from "../../shared/types/PreCadastro";
import { usePreCadastros } from "../../app/composables/usePreCadastros";

// usePreCadastros: a lista de pendentes e as três decisões (aprovar, vincular, rejeitar) com o servidor simulado por `fetch`. Cada decisão devolve um
// RESULTADO (decidido, conflito, ja-decidido, erro, ocupado). Dados fictícios (TESTE).

const pre = (id: string, nome: string, extra: Partial<PreCadastroDaLista> = {}): PreCadastroDaLista => ({
  id,
  nome,
  temperatura: "2°C a 8°C",
  status: "pendente",
  compra: "Compra 07 - Novembro/2026",
  compraId: "compra_1",
  solicitadoPor: "Op Teste",
  solicitadoEm: "2026-11-12T12:00:00.000Z",
  decididoPor: null,
  decididoEm: null,
  cadastroId: null,
  ...extra,
});

const ALFA = pre("pre_alfa", "TESTE MEDICAMENTO ALFA");
const BETA = pre("pre_beta", "TESTE MEDICAMENTO BETA");

const resposta = (p: PreCadastroDaLista, itens = 2, compras = 1): RespostaDecisaoPreCadastro => ({ preCadastro: p, itens, compras, medicamentoCriado: true });

interface Chamada {
  metodo: string;
  url: string;
  corpo: unknown;
}
let chamadas: Chamada[];
let pendentes: PreCadastroDaLista[];
/** Respostas de erro programadas para as próximas chamadas que casarem (metodo + trecho da url). */
let falhas: Array<{ metodo: string; trecho: string; status: number; corpo: unknown }>;
let segurar: { liberar: () => void } | null;

const json = (corpo: unknown, status = 200): Response => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  chamadas = [];
  pendentes = [ALFA, BETA];
  falhas = [];
  segurar = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      const metodo = (opts?.method ?? "GET").toUpperCase();
      chamadas.push({ metodo, url: String(url), corpo: opts?.body ? JSON.parse(String(opts.body)) : null });
      const f = falhas.findIndex((x) => x.metodo === metodo && String(url).includes(x.trecho));
      if (f >= 0) {
        const falha = falhas.splice(f, 1)[0]!;
        return json(falha.corpo, falha.status);
      }
      if (metodo === "GET") return json({ status: "pendente", total: pendentes.length, itens: pendentes });
      if (segurar) await new Promise<void>((liberar) => (segurar!.liberar = liberar));
      const id = /pre-medicamentos\/([\w-]+)\//.exec(String(url))![1]!;
      const alvo = pendentes.find((p) => p.id === id)!;
      pendentes = pendentes.filter((p) => p.id !== id);
      return json(resposta({ ...alvo, status: String(url).endsWith("/rejeitar") ? "rejeitado" : "aprovado" }));
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("carregar", () => {
  it("lê os pendentes (status=pendente), preenche a lista e o contador", async () => {
    const c = usePreCadastros();
    expect(c.total.value).toBe(0);
    expect(c.carregou.value).toBe(false);
    const p = c.carregar();
    expect(c.carregando.value).toBe(true);
    await p;
    expect(chamadas).toEqual([{ metodo: "GET", url: "/api/cadastros/pre-medicamentos?status=pendente", corpo: null }]);
    expect(c.itens.value.map((i) => i.id)).toEqual(["pre_alfa", "pre_beta"]);
    expect(c.total.value).toBe(2);
    expect(c.carregando.value).toBe(false);
    expect(c.carregou.value).toBe(true);
    expect(c.erro.value).toBeNull();
  });

  it("sem pendentes: lista vazia, contador 0 e carregou", async () => {
    pendentes = [];
    const c = usePreCadastros();
    await c.carregar();
    expect(c.total.value).toBe(0);
    expect(c.carregou.value).toBe(true);
  });

  it("falha: guarda a mensagem do servidor, NÃO marca carregou e uma nova leitura limpa o erro", async () => {
    falhas.push({ metodo: "GET", trecho: "pre-medicamentos", status: 500, corpo: { statusMessage: "Falha no servidor." } });
    const c = usePreCadastros();
    await c.carregar();
    expect(c.erro.value).toBe("Falha no servidor.");
    expect(c.carregou.value).toBe(false);
    await c.carregar();
    expect(c.erro.value).toBeNull();
    expect(c.total.value).toBe(2);
  });

  it("resposta fora do formato vale lista vazia (não quebra a aba)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([])));
    const c = usePreCadastros();
    await c.carregar();
    expect(c.itens.value).toEqual([]);
    expect(c.erro.value).toBeNull();
  });

  it("uma resposta velha que chega depois de outra mais nova é descartada", async () => {
    let liberarPrimeira!: () => void;
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        n += 1;
        if (n === 1) {
          await new Promise<void>((r) => (liberarPrimeira = r));
          return json({ status: "pendente", total: 2, itens: [ALFA, BETA] });
        }
        return json({ status: "pendente", total: 1, itens: [BETA] });
      }),
    );
    const c = usePreCadastros();
    const velha = c.carregar();
    await c.carregar();
    liberarPrimeira();
    await velha;
    expect(c.itens.value.map((i) => i.id)).toEqual(["pre_beta"]);
  });
});

describe("aprovar", () => {
  it("envia nome e temperatura, tira o pendente da lista e devolve a resposta", async () => {
    const c = usePreCadastros();
    await c.carregar();
    const r = await c.aprovar("pre_alfa", { nome: "TESTE MEDICAMENTO ALFA 5 MG", temperatura: "Ambiente" });
    expect(chamadas.at(-1)).toEqual({ metodo: "POST", url: "/api/cadastros/pre-medicamentos/pre_alfa/aprovar", corpo: { nome: "TESTE MEDICAMENTO ALFA 5 MG", temperatura: "Ambiente" } });
    expect(r).toMatchObject({ tipo: "decidido", acao: "aprovado", resposta: { itens: 2, compras: 1 } });
    expect(c.itens.value.map((i) => i.id)).toEqual(["pre_beta"]);
    expect(c.total.value).toBe(1);
    expect(c.estadoDa("pre_alfa").ocupado).toBe(false);
  });

  it("409 medicamento_ja_cadastrado: fica na lista, com o existente na linha (ativo = pode vincular)", async () => {
    const c = usePreCadastros();
    await c.carregar();
    falhas.push({
      metodo: "POST",
      trecho: "/aprovar",
      status: 409,
      corpo: { statusMessage: "Já existe um medicamento com esse nome no Cadastro.", data: { code: "medicamento_ja_cadastrado", existente: { id: "med_gama", nome: "TESTE MEDICAMENTO GAMA", temperatura: "Ambiente", ativo: true } } },
    });
    const r = await c.aprovar("pre_alfa", { nome: "TESTE MEDICAMENTO GAMA", temperatura: "Ambiente" });
    expect(r).toMatchObject({ tipo: "conflito", conflito: { tipo: "ja-cadastrado", existente: { id: "med_gama", ativo: true } } });
    expect(c.estadoDa("pre_alfa").conflito).toMatchObject({ tipo: "ja-cadastrado" });
    expect(c.itens.value.map((i) => i.id)).toContain("pre_alfa");
    expect(c.estadoDa("pre_alfa").ocupado).toBe(false);
  });

  it("409 com o existente INATIVO: o conflito é 'inativo' (não oferece vincular)", async () => {
    const c = usePreCadastros();
    await c.carregar();
    falhas.push({
      metodo: "POST",
      trecho: "/aprovar",
      status: 409,
      corpo: { statusMessage: "x", data: { code: "medicamento_ja_cadastrado", existente: { id: "med_delta", nome: "TESTE MEDICAMENTO DELTA", temperatura: "Ambiente", ativo: false } } },
    });
    const r = await c.aprovar("pre_alfa", { nome: "TESTE MEDICAMENTO DELTA", temperatura: "Ambiente" });
    expect(r).toMatchObject({ tipo: "conflito", conflito: { tipo: "inativo", existente: { ativo: false } } });
  });

  it("422 de validação: a mensagem do servidor fica na linha e o botão segue disponível", async () => {
    const c = usePreCadastros();
    await c.carregar();
    falhas.push({ metodo: "POST", trecho: "/aprovar", status: 422, corpo: { statusMessage: "Temperatura não encontrada no Cadastro de Temperaturas." } });
    const r = await c.aprovar("pre_alfa", { nome: "TESTE", temperatura: "Quente" });
    expect(r).toEqual({ tipo: "erro", mensagem: "Temperatura não encontrada no Cadastro de Temperaturas." });
    expect(c.estadoDa("pre_alfa").erro).toBe("Temperatura não encontrada no Cadastro de Temperaturas.");
    expect(c.estadoDa("pre_alfa").ocupado).toBe(false);
    expect(c.itens.value).toHaveLength(2);
  });

  it("falha do servidor (5xx): texto padrão, sem repassar o detalhe; rede: mensagem de conexão", async () => {
    const c = usePreCadastros();
    await c.carregar();
    falhas.push({ metodo: "POST", trecho: "/aprovar", status: 500, corpo: { statusMessage: "Supabase: falha ao ligar os itens — detalhe interno" } });
    const r = await c.aprovar("pre_alfa", { nome: "TESTE", temperatura: "Ambiente" });
    expect(r).toMatchObject({ tipo: "erro", mensagem: "Não foi possível concluir. Nada foi perdido: tente de novo (repetir é seguro)." });
    expect(JSON.stringify(r)).not.toContain("detalhe interno");

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const rede = await c.aprovar("pre_alfa", { nome: "TESTE", temperatura: "Ambiente" });
    expect(rede).toEqual({ tipo: "erro", mensagem: "Erro de conexão com o servidor. Tente novamente." });
  });

  it("segundo clique durante uma decisão em andamento NÃO envia nada (ocupado)", async () => {
    const c = usePreCadastros();
    await c.carregar();
    segurar = { liberar: () => undefined };
    const primeira = c.aprovar("pre_alfa", { nome: "TESTE MEDICAMENTO ALFA", temperatura: "Ambiente" });
    await Promise.resolve();
    expect(c.estadoDa("pre_alfa").ocupado).toBe(true);
    const segunda = await c.aprovar("pre_alfa", { nome: "TESTE MEDICAMENTO ALFA", temperatura: "Ambiente" });
    const rejeitar = await c.rejeitar("pre_alfa");
    expect(segunda).toEqual({ tipo: "ocupado" });
    expect(rejeitar).toEqual({ tipo: "ocupado" });
    segurar.liberar();
    await primeira;
    expect(chamadas.filter((x) => x.metodo === "POST")).toHaveLength(1);
  });

  it("outra linha pode ser decidida enquanto uma está ocupada", async () => {
    const c = usePreCadastros();
    await c.carregar();
    segurar = { liberar: () => undefined };
    const primeira = c.aprovar("pre_alfa", { nome: "TESTE MEDICAMENTO ALFA", temperatura: "Ambiente" });
    await Promise.resolve();
    expect(c.estadoDa("pre_beta").ocupado).toBe(false);
    segurar.liberar();
    await primeira;
  });
});

describe("decisão simultânea (409 pre_cadastro_ja_decidido)", () => {
  it("relê a lista (o pendente sai) e devolve o status que a outra pessoa decidiu", async () => {
    const c = usePreCadastros();
    await c.carregar();
    pendentes = [BETA]; // a outra pessoa já decidiu o ALFA
    falhas.push({
      metodo: "POST",
      trecho: "/aprovar",
      status: 409,
      corpo: { statusMessage: "Este pré-cadastro já foi decidido por outra pessoa.", data: { code: "pre_cadastro_ja_decidido", status: "rejeitado", preCadastro: { ...ALFA, status: "rejeitado" } } },
    });
    const r = await c.aprovar("pre_alfa", { nome: "TESTE MEDICAMENTO ALFA", temperatura: "Ambiente" });
    expect(r).toMatchObject({ tipo: "ja-decidido", status: "rejeitado" });
    expect(chamadas.filter((x) => x.metodo === "GET")).toHaveLength(2); // a leitura inicial e a releitura
    expect(c.itens.value.map((i) => i.id)).toEqual(["pre_beta"]);
  });

  it("vale também para rejeitar", async () => {
    const c = usePreCadastros();
    await c.carregar();
    falhas.push({ metodo: "POST", trecho: "/rejeitar", status: 409, corpo: { statusMessage: "x", data: { code: "pre_cadastro_ja_decidido", status: "aprovado", preCadastro: { ...ALFA, status: "aprovado" } } } });
    expect(await c.rejeitar("pre_alfa")).toMatchObject({ tipo: "ja-decidido", status: "aprovado" });
  });
});

describe("vincular", () => {
  it("envia o nome com vincularExistente: true", async () => {
    const c = usePreCadastros();
    await c.carregar();
    const r = await c.vincular("pre_alfa", "TESTE MEDICAMENTO GAMA");
    expect(chamadas.at(-1)).toEqual({ metodo: "POST", url: "/api/cadastros/pre-medicamentos/pre_alfa/aprovar", corpo: { nome: "TESTE MEDICAMENTO GAMA", vincularExistente: true } });
    expect(r).toMatchObject({ tipo: "decidido", acao: "vinculado" });
    expect(c.total.value).toBe(1);
  });

  it("existente inativo (409 medicamento_inativo): conflito 'inativo' e nada sai da lista", async () => {
    const c = usePreCadastros();
    await c.carregar();
    falhas.push({
      metodo: "POST",
      trecho: "/aprovar",
      status: 409,
      corpo: { statusMessage: "Esse medicamento está inativo no Cadastro.", data: { code: "medicamento_inativo", existente: { id: "med_delta", nome: "TESTE MEDICAMENTO DELTA", temperatura: "Ambiente", ativo: false } } },
    });
    expect(await c.vincular("pre_alfa", "TESTE MEDICAMENTO DELTA")).toMatchObject({ tipo: "conflito", conflito: { tipo: "inativo" } });
    expect(c.total.value).toBe(2);
  });
});

describe("rejeitar", () => {
  it("POST sem corpo, o pendente sai da lista", async () => {
    const c = usePreCadastros();
    await c.carregar();
    const r = await c.rejeitar("pre_beta");
    expect(chamadas.at(-1)).toEqual({ metodo: "POST", url: "/api/cadastros/pre-medicamentos/pre_beta/rejeitar", corpo: null });
    expect(r).toMatchObject({ tipo: "decidido", acao: "rejeitado" });
    expect(c.itens.value.map((i) => i.id)).toEqual(["pre_alfa"]);
  });
});

describe("limparConflito", () => {
  it("tira o conflito e o erro da linha (a pessoa mudou o nome)", async () => {
    const c = usePreCadastros();
    await c.carregar();
    falhas.push({ metodo: "POST", trecho: "/aprovar", status: 409, corpo: { statusMessage: "x", data: { code: "medicamento_ja_cadastrado", existente: { id: "m", nome: "X", temperatura: "", ativo: true } } } });
    await c.aprovar("pre_alfa", { nome: "X", temperatura: "Ambiente" });
    expect(c.estadoDa("pre_alfa").conflito).not.toBeNull();
    c.limparConflito("pre_alfa");
    expect(c.estadoDa("pre_alfa")).toMatchObject({ conflito: null, erro: null });
  });
});
