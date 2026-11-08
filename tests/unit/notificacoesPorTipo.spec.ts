import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, type Ref } from "vue";
import type { Notificacao, TipoNotificacao } from "../../shared/types/notificacao";

// Divisão das notificações do sino: recado_* só em "Recados", conta_editada só em "Contas", badge
// somando as 4 seções sem contar nada duas vezes. useNotificacoes depende do runtime do Nuxt ("#app"),
// então aqui o useState é simulado com um mapa por chave.
const estados = vi.hoisted(() => new Map<string, unknown>());

vi.mock("#app", () => ({
  useState: <T>(chave: string, init: () => T): Ref<T> => {
    if (!estados.has(chave)) estados.set(chave, ref(init()));
    return estados.get(chave) as Ref<T>;
  },
}));

import {
  TIPOS_DE_CONTA,
  TIPOS_DE_RECADO,
  naoLidasDeContas,
  naoLidasDeRecados,
  totalDoBadgeSino,
} from "../../app/utils/notificacoesPorTipo";
import { useNotificacoes } from "../../app/composables/useNotificacoes";

let seq = 0;
function notif(tipo: TipoNotificacao, over: Partial<Notificacao> = {}): Notificacao {
  seq += 1;
  return {
    id: `n${seq}`,
    destinatarioId: "u1",
    tipo,
    mensagem: `mensagem ${seq}`,
    lida: false,
    createdAt: "2026-11-05T12:00:00.000Z",
    ...over,
  };
}

describe("seções do sino por tipo", () => {
  it("recado_novo e recado_concluido (não lidos) só vão pra Recados", () => {
    const lista = [notif("recado_novo"), notif("recado_concluido"), notif("conta_editada")];
    expect(naoLidasDeRecados(lista).map((n) => n.tipo)).toEqual(["recado_novo", "recado_concluido"]);
  });

  it("conta_editada (não lida) só vai pra Contas — nunca pra Recados", () => {
    const lista = [notif("recado_novo"), notif("conta_editada"), notif("conta_editada")];
    expect(naoLidasDeContas(lista).map((n) => n.tipo)).toEqual(["conta_editada", "conta_editada"]);
    expect(naoLidasDeRecados(lista).some((n) => n.tipo === "conta_editada")).toBe(false);
  });

  it("lidas não aparecem em nenhuma seção", () => {
    const lista = [notif("recado_novo", { lida: true }), notif("conta_editada", { lida: true })];
    expect(naoLidasDeRecados(lista)).toEqual([]);
    expect(naoLidasDeContas(lista)).toEqual([]);
  });

  it("os conjuntos de tipos são disjuntos (cada tipo em UMA seção) e cobrem todos os tipos conhecidos", () => {
    expect(TIPOS_DE_RECADO.filter((t) => TIPOS_DE_CONTA.includes(t))).toEqual([]);
    expect([...TIPOS_DE_RECADO, ...TIPOS_DE_CONTA].sort()).toEqual(
      ["conta_editada", "recado_concluido", "recado_novo"].sort(),
    );
  });

  it("nenhuma notificação cai em duas seções ao mesmo tempo", () => {
    const lista = [notif("recado_novo"), notif("recado_concluido"), notif("conta_editada")];
    const ids = [...naoLidasDeRecados(lista), ...naoLidasDeContas(lista)].map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(lista.length);
  });
});

describe("badge do sino", () => {
  it("soma Fornecedor + Mandado + Chegada + Recados + Contas", () => {
    expect(totalDoBadgeSino({ fornecedor: 2, mandado: 1, chegada: 5, recados: 3, contas: 4 })).toBe(15);
  });

  it("sem notificação de conta o total é o mesmo de antes (Fornecedor + Mandado + Recados)", () => {
    expect(totalDoBadgeSino({ fornecedor: 2, mandado: 1, chegada: 0, recados: 3, contas: 0 })).toBe(6);
  });

  it("com a lista real: 2 recados + 1 conta + 1 Fornecedor + 1 Mandado = 5", () => {
    const lista = [notif("recado_novo"), notif("recado_concluido"), notif("conta_editada")];
    expect(
      totalDoBadgeSino({
        fornecedor: 1,
        mandado: 1,
        chegada: 0,
        recados: naoLidasDeRecados(lista).length,
        contas: naoLidasDeContas(lista).length,
      }),
    ).toBe(5);
  });
});

describe("useNotificacoes — getters por tipo", () => {
  beforeEach(() => {
    estados.clear();
  });

  it("recadosNaoLidos e contasNaoLidas acompanham a lista; naoLidas continua contando TODAS", () => {
    const { notificacoes, recadosNaoLidos, contasNaoLidas, naoLidas } = useNotificacoes();
    notificacoes.value = [
      notif("recado_novo"),
      notif("recado_concluido", { lida: true }),
      notif("conta_editada"),
      notif("conta_editada", { lida: true }),
    ];

    expect(recadosNaoLidos.value).toHaveLength(1);
    expect(contasNaoLidas.value).toHaveLength(1);
    expect(naoLidas.value).toBe(2); // comportamento anterior: todas as não lidas, de qualquer tipo
  });

  it("marcar uma conta como lida tira só ela da seção Contas", () => {
    const { notificacoes, recadosNaoLidos, contasNaoLidas } = useNotificacoes();
    const conta = notif("conta_editada");
    notificacoes.value = [notif("recado_novo"), conta];

    notificacoes.value = notificacoes.value.map((n) => (n.id === conta.id ? { ...n, lida: true } : n));

    expect(contasNaoLidas.value).toEqual([]);
    expect(recadosNaoLidos.value).toHaveLength(1);
  });
});
