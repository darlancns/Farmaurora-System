import { describe, expect, it } from "vitest";
import { filtrarLembretesVisiveis } from "../../app/utils/lembretesFiltros";
import type { LembretePessoal } from "../../shared/types/lembretePessoal";

function lembrete(overrides: Partial<LembretePessoal> & Pick<LembretePessoal, "id">): LembretePessoal {
  return {
    usuarioId: "user-eu",
    titulo: `Lembrete ${overrides.id}`,
    mensagem: "mensagem de teste",
    tipo: "geral",
    fixado: false,
    concluido: false,
    createdAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-10T10:00:00.000Z",
    ...overrides,
  };
}

describe("filtrarLembretesVisiveis", () => {
  it("remove concluídos da lista (definitivo, mesmo padrão de Recado)", () => {
    const ativo = lembrete({ id: "l-ativo" });
    const concluido = lembrete({ id: "l-concluido", concluido: true });

    const visiveis = filtrarLembretesVisiveis([ativo, concluido]);

    expect(visiveis.map((l) => l.id)).toEqual(["l-ativo"]);
  });

  it("ordena fixado primeiro, depois created_at desc", () => {
    const antigoFixado = lembrete({ id: "l-antigo-fixado", fixado: true, createdAt: "2026-09-01T00:00:00.000Z" });
    const recente = lembrete({ id: "l-recente", createdAt: "2026-09-12T00:00:00.000Z" });
    const meio = lembrete({ id: "l-meio", createdAt: "2026-09-05T00:00:00.000Z" });

    const visiveis = filtrarLembretesVisiveis([recente, meio, antigoFixado]);

    expect(visiveis.map((l) => l.id)).toEqual(["l-antigo-fixado", "l-recente", "l-meio"]);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(filtrarLembretesVisiveis([])).toEqual([]);
  });
});
