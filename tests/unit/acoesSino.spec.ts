import { describe, expect, it, vi } from "vitest";
import { criarAcoesSino } from "../../app/utils/acoesSino";
import type { NotificacaoFornecedor } from "../../app/utils/prazoFornecedor";
import type { NotificacaoMandado } from "../../app/utils/prazoMandado";
import type { Notificacao } from "#shared/types/notificacao";

const fornecedor = (processoId: string): NotificacaoFornecedor => ({
  processoId,
  paciente: "Fulano",
  pasta: "2026 - 10",
  fornecedor: "Poros - Turquia",
  diasDeAtraso: 4,
});

const mandado = (processoId: string): NotificacaoMandado => ({
  processoId,
  paciente: "Fulano",
  pasta: "2026 - 345",
  responsavel: "Bruno",
  registroLpco: "2026-09-29",
  registroDDMM: "29/09",
  diasDecorridos: 37,
});

const recado = (over: Partial<Notificacao> = {}): Notificacao => ({
  id: "notif_1",
  destinatarioId: "u1",
  tipo: "recado_novo",
  recadoId: "recado_9",
  mensagem: "Novo recado",
  lida: false,
  createdAt: "2026-09-08T12:00:00.000Z",
  ...over,
});

function montar() {
  const navegar = vi.fn();
  const fecharPainel = vi.fn();
  const resolverFornecedor = vi.fn().mockResolvedValue(undefined);
  const resolverMandado = vi.fn().mockResolvedValue(undefined);
  const marcarRecadoLido = vi.fn().mockResolvedValue(undefined);
  const marcarContaLida = vi.fn().mockResolvedValue(undefined);
  const marcarProcessoLido = vi.fn().mockResolvedValue(undefined);
  const acoes = criarAcoesSino({
    navegar,
    fecharPainel,
    resolverFornecedor,
    resolverMandado,
    marcarRecadoLido,
    marcarContaLida,
    marcarProcessoLido,
  });
  return {
    acoes,
    navegar,
    fecharPainel,
    resolverFornecedor,
    resolverMandado,
    marcarRecadoLido,
    marcarContaLida,
    marcarProcessoLido,
  };
}

describe("clique no TEXTO do alerta de Fornecedor", () => {
  it("navega para /processos?processo=<id do alerta> e fecha o sino (mesma rota do Mandado)", () => {
    const { acoes, navegar, fecharPainel, resolverFornecedor } = montar();

    acoes.abrirProcesso(fornecedor("proc_10"));

    expect(navegar).toHaveBeenCalledTimes(1);
    expect(navegar).toHaveBeenCalledWith({ path: "/processos", query: { processo: "proc_10" } });
    expect(fecharPainel).toHaveBeenCalledTimes(1);
    expect(resolverFornecedor).not.toHaveBeenCalled();
  });

  it("usa o id de cada item", () => {
    const { acoes, navegar } = montar();
    acoes.abrirProcesso(fornecedor("proc_a"));
    acoes.abrirProcesso(fornecedor("proc_b"));
    expect(navegar.mock.calls.map(([rota]) => rota.query.processo)).toEqual(["proc_a", "proc_b"]);
  });
});

describe("clique no CHECK do alerta de Fornecedor", () => {
  it("só resolve: não navega, não fecha o sino e corta a propagação do clique", async () => {
    const { acoes, navegar, fecharPainel, resolverFornecedor, resolverMandado } = montar();
    const evento = { stopPropagation: vi.fn() };

    await acoes.resolverFornecedor(fornecedor("proc_10"), evento);

    expect(resolverFornecedor).toHaveBeenCalledTimes(1);
    expect(resolverFornecedor).toHaveBeenCalledWith(expect.objectContaining({ processoId: "proc_10" }));
    expect(resolverMandado).not.toHaveBeenCalled();
    expect(evento.stopPropagation).toHaveBeenCalledTimes(1);
    expect(navegar).not.toHaveBeenCalled();
    expect(fecharPainel).not.toHaveBeenCalled();
  });
});

describe("Mandado (comportamento anterior preservado)", () => {
  it("texto navega com o id certo e fecha o sino; check só resolve", async () => {
    const { acoes, navegar, fecharPainel, resolverMandado } = montar();

    acoes.abrirProcesso(mandado("proc_345"));
    expect(navegar).toHaveBeenCalledWith({ path: "/processos", query: { processo: "proc_345" } });
    expect(fecharPainel).toHaveBeenCalledTimes(1);

    navegar.mockClear();
    fecharPainel.mockClear();
    const evento = { stopPropagation: vi.fn() };
    await acoes.resolverMandado(mandado("proc_345"), evento);
    expect(resolverMandado).toHaveBeenCalledTimes(1);
    expect(evento.stopPropagation).toHaveBeenCalledTimes(1);
    expect(navegar).not.toHaveBeenCalled();
    expect(fecharPainel).not.toHaveBeenCalled();
  });
});

describe("clique na notificação de RECADO", () => {
  it("navega para /recados?recado=<recado_id>, marca como lida e fecha o sino", async () => {
    const { acoes, navegar, fecharPainel, marcarRecadoLido } = montar();
    const n = recado();

    await acoes.abrirRecado(n);

    expect(navegar).toHaveBeenCalledTimes(1);
    expect(navegar).toHaveBeenCalledWith({ path: "/recados", query: { recado: "recado_9" } });
    expect(fecharPainel).toHaveBeenCalledTimes(1);
    expect(marcarRecadoLido).toHaveBeenCalledTimes(1);
    expect(marcarRecadoLido).toHaveBeenCalledWith(n);
  });

  it("vale para recado_concluido também", async () => {
    const { acoes, navegar } = montar();
    await acoes.abrirRecado(recado({ tipo: "recado_concluido", recadoId: "recado_7" }));
    expect(navegar).toHaveBeenCalledWith({ path: "/recados", query: { recado: "recado_7" } });
  });

  it("recado apagado (sem recadoId): abre /recados sem query, marca como lida e não quebra", async () => {
    const { acoes, navegar, marcarRecadoLido } = montar();
    const n = recado({ recadoId: undefined });

    await expect(acoes.abrirRecado(n)).resolves.toBeUndefined();

    expect(navegar).toHaveBeenCalledWith({ path: "/recados", query: {} });
    expect(marcarRecadoLido).toHaveBeenCalledWith(n);
  });

  it("navega ANTES de marcar como lida: falha ao marcar não impede de abrir a página", async () => {
    const { acoes, navegar, fecharPainel, marcarRecadoLido } = montar();
    marcarRecadoLido.mockRejectedValue(new Error("falhou"));

    await expect(acoes.abrirRecado(recado())).rejects.toThrow("falhou");

    expect(fecharPainel).toHaveBeenCalledTimes(1);
    expect(navegar).toHaveBeenCalledTimes(1);
  });
});

const conta = (over: Partial<Notificacao> = {}): Notificacao => ({
  id: "notif_conta_1",
  destinatarioId: "u1",
  tipo: "conta_editada",
  mensagem: "Fulano editou a senha",
  lida: false,
  createdAt: "2026-11-05T12:00:00.000Z",
  ...over,
});

describe("clique na notificação de CONTA EDITADA", () => {
  it("navega para /configuracoes?aba=contas, marca como lida e fecha o sino", async () => {
    const { acoes, navegar, fecharPainel, marcarContaLida } = montar();
    const n = conta();

    await acoes.abrirConta(n);

    expect(navegar).toHaveBeenCalledTimes(1);
    expect(navegar).toHaveBeenCalledWith({ path: "/configuracoes", query: { aba: "contas" } });
    expect(fecharPainel).toHaveBeenCalledTimes(1);
    expect(marcarContaLida).toHaveBeenCalledTimes(1);
    expect(marcarContaLida).toHaveBeenCalledWith(n);
  });

  it("não aciona nenhuma outra ação do sino (recado, Fornecedor, Mandado)", async () => {
    const { acoes, marcarRecadoLido, resolverFornecedor, resolverMandado } = montar();
    await acoes.abrirConta(conta());
    expect(marcarRecadoLido).not.toHaveBeenCalled();
    expect(resolverFornecedor).not.toHaveBeenCalled();
    expect(resolverMandado).not.toHaveBeenCalled();
  });

  it("e o clique em recado não marca como lida pela ação de conta", async () => {
    const { acoes, marcarContaLida, marcarRecadoLido } = montar();
    await acoes.abrirRecado(recado());
    expect(marcarRecadoLido).toHaveBeenCalledTimes(1);
    expect(marcarContaLida).not.toHaveBeenCalled();
  });

  it("navega ANTES de marcar como lida: falha ao marcar não impede de abrir a página", async () => {
    const { acoes, navegar, fecharPainel, marcarContaLida } = montar();
    marcarContaLida.mockRejectedValue(new Error("falhou"));

    await expect(acoes.abrirConta(conta())).rejects.toThrow("falhou");

    expect(fecharPainel).toHaveBeenCalledTimes(1);
    expect(navegar).toHaveBeenCalledTimes(1);
  });
});

const avisoProcesso = (over: Partial<Notificacao> = {}): Notificacao => ({
  id: "notif_proc_1",
  destinatarioId: "u1",
  tipo: "pendencia_nova",
  processoId: "proc_77",
  mensagem: "Nova pendência · Fulano (2026 - 10): Falta laudo",
  lida: false,
  createdAt: "2026-11-08T12:00:00.000Z",
  ...over,
});

describe("clique no aviso de NOVA PENDÊNCIA / NOVA ATUALIZAÇÃO (seção Processos)", () => {
  it("navega para /processos?processo=<processo_id>, marca como lida e fecha o sino", async () => {
    const { acoes, navegar, fecharPainel, marcarProcessoLido } = montar();
    const n = avisoProcesso();

    await acoes.abrirProcessoDaNotificacao(n);

    expect(navegar).toHaveBeenCalledTimes(1);
    expect(navegar).toHaveBeenCalledWith({ path: "/processos", query: { processo: "proc_77" } });
    expect(fecharPainel).toHaveBeenCalledTimes(1);
    expect(marcarProcessoLido).toHaveBeenCalledWith(n);
  });

  it("vale para atualizacao_nova também", async () => {
    const { acoes, navegar } = montar();
    await acoes.abrirProcessoDaNotificacao(avisoProcesso({ tipo: "atualizacao_nova", processoId: "proc_88" }));
    expect(navegar).toHaveBeenCalledWith({ path: "/processos", query: { processo: "proc_88" } });
  });

  it("sem processoId abre /processos sem query e ainda marca como lida", async () => {
    const { acoes, navegar, marcarProcessoLido } = montar();
    const n = avisoProcesso({ processoId: undefined });
    await acoes.abrirProcessoDaNotificacao(n);
    expect(navegar).toHaveBeenCalledWith({ path: "/processos", query: {} });
    expect(marcarProcessoLido).toHaveBeenCalledWith(n);
  });

  it("não aciona as ações de recado e de conta; navega ANTES de marcar como lida", async () => {
    const { acoes, navegar, marcarRecadoLido, marcarContaLida, marcarProcessoLido } = montar();
    marcarProcessoLido.mockRejectedValue(new Error("falhou"));

    await expect(acoes.abrirProcessoDaNotificacao(avisoProcesso())).rejects.toThrow("falhou");

    expect(navegar).toHaveBeenCalledTimes(1);
    expect(marcarRecadoLido).not.toHaveBeenCalled();
    expect(marcarContaLida).not.toHaveBeenCalled();
  });
});
