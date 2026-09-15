import { describe, expect, it } from "vitest";
import { dividirRecados } from "../../app/utils/recadosFiltros";
import type { Recado } from "../../shared/types/recado";

// dividirRecados assume que GET /api/recados já devolveu só o que o usuário
// pode ver (público + do próprio cargo + direcionado a ele + o que ele
// autorou — filtro feito no backend, ver server/utils/recadosStore.ts). Este
// teste cobre só a parte client-side: remover concluídos por mim, ordenar
// fixado primeiro, e separar Recebidos (não sou autor) de Enviados (sou autor).

const EU = "user-eu";
const OUTRO = "user-outro";

function recado(overrides: Partial<Recado> & Pick<Recado, "id">): Recado {
  return {
    autorId: OUTRO,
    titulo: `Recado ${overrides.id}`,
    mensagem: "mensagem de teste",
    tipo: "geral",
    destinatarioTipo: "publico",
    fixadoPorMim: false,
    concluidoPorMim: false,
    createdAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-10T10:00:00.000Z",
    ...overrides,
  };
}

describe("dividirRecados", () => {
  it("divide um conjunto misto (público, cargo, pessoa, autorado por mim, concluído por mim) em todos/recebidos/enviados", () => {
    const publico = recado({ id: "r-publico", destinatarioTipo: "publico", createdAt: "2026-09-10T08:00:00.000Z" });
    const deCargo = recado({
      id: "r-cargo",
      destinatarioTipo: "cargo",
      destinatarioCargo: "operacional",
      createdAt: "2026-09-10T09:00:00.000Z",
    });
    const dePessoa = recado({
      id: "r-pessoa",
      destinatarioTipo: "pessoa",
      destinatarioPessoaId: EU,
      createdAt: "2026-09-10T10:00:00.000Z",
    });
    const autoradoPorMim = recado({
      id: "r-autorado-por-mim",
      autorId: EU,
      destinatarioTipo: "publico",
      createdAt: "2026-09-10T11:00:00.000Z",
    });
    const concluidoPorMim = recado({
      id: "r-concluido-por-mim",
      destinatarioTipo: "publico",
      concluidoPorMim: true,
      createdAt: "2026-09-10T12:00:00.000Z",
    });

    const { todos, recebidos, enviados } = dividirRecados(
      [publico, deCargo, dePessoa, autoradoPorMim, concluidoPorMim],
      EU,
    );

    const idsTodos = todos.map((r) => r.id);
    const idsRecebidos = recebidos.map((r) => r.id);
    const idsEnviados = enviados.map((r) => r.id);

    // concluído por mim some de TODAS as abas — concluir é individual e
    // definitivo, não apaga o recado (outros destinatários continuam vendo).
    expect(idsTodos).not.toContain("r-concluido-por-mim");
    expect(idsRecebidos).not.toContain("r-concluido-por-mim");
    expect(idsEnviados).not.toContain("r-concluido-por-mim");

    // todos = tudo que não foi concluído por mim (público + cargo + pessoa +
    // o que eu autorei).
    expect(idsTodos.sort()).toEqual(["r-autorado-por-mim", "r-cargo", "r-pessoa", "r-publico"].sort());

    // recebidos = todos, exceto o que eu mesmo criei.
    expect(idsRecebidos.sort()).toEqual(["r-cargo", "r-pessoa", "r-publico"].sort());
    expect(idsRecebidos).not.toContain("r-autorado-por-mim");

    // enviados = só o que eu criei (qualquer destinatário).
    expect(idsEnviados).toEqual(["r-autorado-por-mim"]);
  });

  it("ordena fixado primeiro, depois created_at desc — dentro de todos/recebidos/enviados", () => {
    const antigoFixado = recado({ id: "r-antigo-fixado", fixadoPorMim: true, createdAt: "2026-09-01T00:00:00.000Z" });
    const recenteNaoFixado = recado({ id: "r-recente", fixadoPorMim: false, createdAt: "2026-09-12T00:00:00.000Z" });
    const meioNaoFixado = recado({ id: "r-meio", fixadoPorMim: false, createdAt: "2026-09-05T00:00:00.000Z" });

    const { todos } = dividirRecados([recenteNaoFixado, meioNaoFixado, antigoFixado], EU);

    // fixado vem primeiro mesmo sendo o mais antigo dos 3; os não-fixados
    // ficam depois, ordenados por created_at desc entre si.
    expect(todos.map((r) => r.id)).toEqual(["r-antigo-fixado", "r-recente", "r-meio"]);
  });

  it("meuId null (ex.: sessão ainda não resolvida) não quebra e trata tudo como recebido", () => {
    const r1 = recado({ id: "r1" });
    const { recebidos, enviados } = dividirRecados([r1], null);

    expect(recebidos.map((r) => r.id)).toEqual(["r1"]);
    expect(enviados).toEqual([]);
  });

  it("lista vazia devolve as 3 abas vazias", () => {
    const { todos, recebidos, enviados } = dividirRecados([], EU);
    expect(todos).toEqual([]);
    expect(recebidos).toEqual([]);
    expect(enviados).toEqual([]);
  });
});
