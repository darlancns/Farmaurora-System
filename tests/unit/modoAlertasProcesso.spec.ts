import { describe, expect, it } from "vitest";
import { ROLES } from "../../shared/utils/rbac";
import { modoAlertasProcesso } from "../../app/utils/modoAlertasProcesso";
import type { Permissoes } from "../../shared/utils/permissoesPagina";

const mapa = (processos: "nenhum" | "ver" | "editar"): Permissoes => ({
  processos,
  pagamentos: "nenhum",
  patients: "nenhum",
});

describe("modoAlertasProcesso — sem mapa: igual a canWrite('processos') de antes", () => {
  it("socio, operacional e administrador = editar; consultor = nenhum (nunca recebeu esses alertas)", () => {
    expect(modoAlertasProcesso({ role: "socio" })).toBe("editar");
    expect(modoAlertasProcesso({ role: "operacional" })).toBe("editar");
    expect(modoAlertasProcesso({ role: "administrador" })).toBe("editar");
    expect(modoAlertasProcesso({ role: "consultor" })).toBe("nenhum");
  });

  it("sem usuário = nenhum", () => {
    expect(modoAlertasProcesso(null)).toBe("nenhum");
    expect(modoAlertasProcesso(undefined)).toBe("nenhum");
  });
});

describe("modoAlertasProcesso — com mapa (socio e operacional)", () => {
  it.each(["socio", "operacional"] as const)("%s: editar → editar, ver → ver, nenhum → nenhum", (role) => {
    expect(modoAlertasProcesso({ role, permissoes: mapa("editar") })).toBe("editar");
    expect(modoAlertasProcesso({ role, permissoes: mapa("ver") })).toBe("ver");
    expect(modoAlertasProcesso({ role, permissoes: mapa("nenhum") })).toBe("nenhum");
    expect(modoAlertasProcesso({ role, permissoes: {} })).toBe("nenhum"); // seção ausente = nenhum
  });

  it("consultor e administrador ignoram o mapa", () => {
    for (const nivel of ["nenhum", "ver", "editar"] as const) {
      expect(modoAlertasProcesso({ role: "administrador", permissoes: mapa(nivel) })).toBe("editar");
      expect(modoAlertasProcesso({ role: "consultor", permissoes: mapa(nivel) })).toBe("nenhum");
    }
  });

  it("todo cargo tem um modo definido", () => {
    for (const role of ROLES) expect(["nenhum", "ver", "editar"]).toContain(modoAlertasProcesso({ role }));
  });
});
