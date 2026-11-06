import { describe, expect, it, vi } from "vitest";
import type { AtualizacaoProcesso, Processo } from "../../shared/types/processo";
import { adicionarAtualizacao, excluirAtualizacao } from "../../app/utils/atualizacoesLista";
import {
  AtualizacaoInaplicavelError,
  ConflitoVersaoError,
  criarGravadorAtualizacoes,
  MENSAGEM_CONFLITO_VERSAO,
} from "../../app/utils/gravadorAtualizacoes";

// O gravador com um "servidor" em memória que confere a versão como o UPDATE ... WHERE updated_at = ?.
// Cada requisição demora (setTimeout) pra expor corridas de verdade.

function processoBase(atualizacoes: AtualizacaoProcesso[] = []): Processo {
  return {
    id: "p1",
    paciente: "Fulano",
    pasta: "2026 - 1",
    empresa: "FARMAURORA",
    consultor: "Dani",
    medicamentos: [],
    status: "em_transito",
    datas: {},
    pendencias: [],
    atualizacoes,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "v0",
  };
}

function montar(inicial: Processo) {
  const servidor = { atual: { ...inicial }, contador: 0 };
  const local: { p: Processo | undefined } = { p: { ...inicial } };
  const pedidos: Array<{ atualizacoes: AtualizacaoProcesso[]; versao: string }> = [];
  const recarregar = vi.fn(async () => {
    local.p = { ...servidor.atual };
  });

  const gravar = criarGravadorAtualizacoes({
    obter: () => local.p,
    enviar: async (_id, atualizacoes, versao) => {
      pedidos.push({ atualizacoes, versao });
      await new Promise((r) => setTimeout(r, 5));
      if (versao !== servidor.atual.updatedAt) throw new ConflitoVersaoError();
      servidor.contador += 1;
      servidor.atual = { ...servidor.atual, atualizacoes, updatedAt: `v${servidor.contador}` };
      return { ...servidor.atual };
    },
    aplicar: (p) => {
      local.p = p;
    },
    recarregar,
  });

  return { servidor, local, pedidos, recarregar, gravar };
}

const add = (texto: string) => (lista: readonly AtualizacaoProcesso[]) =>
  adicionarAtualizacao(lista, { data: "", texto });

describe("gravador de atualizações", () => {
  it("duas adições rápidas (sem await entre elas) gravam as DUAS, na ordem", async () => {
    const { servidor, local, pedidos, gravar } = montar(processoBase());

    await Promise.all([gravar("p1", add("primeira")), gravar("p1", add("segunda"))]);

    expect(servidor.atual.atualizacoes.map((a) => a.texto)).toEqual(["primeira", "segunda"]);
    expect(local.p?.atualizacoes.map((a) => a.texto)).toEqual(["primeira", "segunda"]);
    // A 2ª foi calculada sobre a lista devolvida pela 1ª, com a versão nova — sem 409.
    expect(pedidos.map((p) => p.versao)).toEqual(["v0", "v1"]);
  });

  it("uma só gravação em voo por vez", async () => {
    let emVoo = 0;
    let maximo = 0;
    let versao = 0;
    const gravar = criarGravadorAtualizacoes({
      obter: () => ({ ...processoBase(), updatedAt: `v${versao}` }),
      enviar: async (_id, atualizacoes) => {
        emVoo += 1;
        maximo = Math.max(maximo, emVoo);
        await new Promise((r) => setTimeout(r, 5));
        emVoo -= 1;
        versao += 1;
        return { ...processoBase(), atualizacoes, updatedAt: `v${versao}` };
      },
      aplicar: () => undefined,
      recarregar: async () => undefined,
    });

    await Promise.all([gravar("p1", add("a")), gravar("p1", add("b")), gravar("p1", add("c"))]);

    expect(versao).toBe(3);
    expect(maximo).toBe(1);
  });

  it("uma gravação que falha não trava a fila: a seguinte roda (sobre a lista que ficou)", async () => {
    const { servidor, gravar } = montar(processoBase());
    const falha = gravar("p1", () => null);
    const ok = gravar("p1", add("depois"));
    await expect(falha).rejects.toBeInstanceOf(AtualizacaoInaplicavelError);
    await ok;
    expect(servidor.atual.atualizacoes.map((a) => a.texto)).toEqual(["depois"]);
  });

  it("adicionar, editar e excluir seguidos (mesmo caminho) ficam consistentes", async () => {
    const { servidor, gravar } = montar(processoBase([{ data: "", texto: "velha" }]));
    await Promise.all([
      gravar("p1", add("nova")),
      gravar("p1", (l) => excluirAtualizacao(l, 0, { data: "", texto: "velha" })),
    ]);
    expect(servidor.atual.atualizacoes.map((a) => a.texto)).toEqual(["nova"]);
  });

  it("versão desatualizada: ConflitoVersaoError (mensagem clara), recarrega o processo e não grava", async () => {
    const { servidor, local, recarregar, gravar } = montar(processoBase());
    // Outra pessoa gravou antes: o servidor já está em v7 com uma atualização que o cliente não viu.
    servidor.atual = { ...servidor.atual, updatedAt: "v7", atualizacoes: [{ data: "", texto: "de outra pessoa" }] };

    const erro = await gravar("p1", add("minha")).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ConflitoVersaoError);
    expect((erro as Error).message).toBe(MENSAGEM_CONFLITO_VERSAO);
    expect(recarregar).toHaveBeenCalledWith("p1");
    expect(servidor.atual.atualizacoes.map((a) => a.texto)).toEqual(["de outra pessoa"]);
    // Depois do conflito o estado local é o do servidor — tentar de novo funciona.
    expect(local.p?.updatedAt).toBe("v7");
    await gravar("p1", add("minha"));
    expect(servidor.atual.atualizacoes.map((a) => a.texto)).toEqual(["de outra pessoa", "minha"]);
  });

  it("falha ao recarregar após o conflito não esconde o conflito", async () => {
    const { servidor, recarregar, gravar } = montar(processoBase());
    servidor.atual = { ...servidor.atual, updatedAt: "v9" };
    recarregar.mockRejectedValueOnce(new Error("rede"));
    await expect(gravar("p1", add("x"))).rejects.toBeInstanceOf(ConflitoVersaoError);
  });

  it("outro tipo de erro (rede/500) não recarrega e é repassado", async () => {
    const recarregar = vi.fn(async () => undefined);
    const gravar = criarGravadorAtualizacoes({
      obter: () => processoBase(),
      enviar: async () => {
        throw new Error("Erro ao atualizar processo.");
      },
      aplicar: () => undefined,
      recarregar,
    });
    await expect(gravar("p1", add("x"))).rejects.toThrow("Erro ao atualizar processo.");
    expect(recarregar).not.toHaveBeenCalled();
  });

  it("processo ausente no estado local → erro", async () => {
    const { local, gravar } = montar(processoBase());
    local.p = undefined;
    await expect(gravar("p1", add("x"))).rejects.toThrow("Processo não encontrado");
  });

  it("filas de processos diferentes não se bloqueiam", async () => {
    const ordem: string[] = [];
    const gravar = criarGravadorAtualizacoes({
      obter: (id) => ({ ...processoBase(), id }),
      enviar: async (id, atualizacoes) => {
        await new Promise((r) => setTimeout(r, id === "lento" ? 30 : 1));
        ordem.push(id);
        return { ...processoBase(), id, atualizacoes };
      },
      aplicar: () => undefined,
      recarregar: async () => undefined,
    });
    await Promise.all([gravar("lento", add("a")), gravar("rapido", add("b"))]);
    expect(ordem).toEqual(["rapido", "lento"]);
  });
});
