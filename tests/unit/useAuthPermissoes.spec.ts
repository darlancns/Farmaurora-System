import { beforeEach, describe, expect, it } from "vitest";
import type { AuthUser } from "#shared/types/auth";
import { ROLES, canReadSection, canWriteSection, type Role, type Section } from "#shared/utils/rbac";
import type { Permissoes } from "#shared/utils/permissoesPagina";
import { useAuth } from "../../app/composables/useAuth";

// useAuth real; "#app" é o substituto de tests/unit/helpers/nuxtAppStub.ts (useState por chave, compartilhado).
const SECOES: Section[] = ["patients", "processos", "pagamentos", "admin", "config", "recados"];

function entrar(role: Role, permissoes?: Permissoes): ReturnType<typeof useAuth> {
  const auth = useAuth();
  auth.user.value = {
    id: "u1",
    email: "u@x.com",
    role,
    isAdmin: role === "administrador",
    ...(permissoes ? { permissoes } : {}),
  } as AuthUser;
  return auth;
}

const TUDO_NENHUM: Permissoes = { processos: "nenhum", pagamentos: "nenhum", patients: "nenhum" };

beforeEach(() => {
  useAuth().user.value = null;
});

describe("useAuth — canRead, canWrite e homeRoute", () => {
  it("sem usuário: não lê nem escreve nada; home é /processos (o login redireciona antes)", () => {
    const auth = useAuth();
    for (const s of SECOES) {
      expect(auth.canRead(s)).toBe(false);
      expect(auth.canWrite(s)).toBe(false);
    }
    expect(auth.homeRoute()).toBe("/processos");
  });

  it.each(ROLES)("%s SEM mapa: idêntico à regra do cargo em todas as seções, e home /processos", (role) => {
    const auth = entrar(role);
    for (const s of SECOES) {
      expect(auth.canRead(s), `${role}/${s}/ler`).toBe(canReadSection(role, s));
      expect(auth.canWrite(s), `${role}/${s}/escrever`).toBe(canWriteSection(role, s));
    }
    expect(auth.homeRoute()).toBe("/processos");
  });

  it("com mapa: 'ver' lê e não escreve (é o que vira readonly nas páginas); 'nenhum' não lê; 'editar' escreve", () => {
    const auth = entrar("operacional", { processos: "ver", pagamentos: "nenhum", patients: "ver" });
    expect(auth.canRead("processos")).toBe(true);
    expect(auth.canWrite("processos")).toBe(false);
    expect(auth.canRead("pagamentos")).toBe(false);
    expect(auth.canWrite("pagamentos")).toBe(false);
    expect(auth.canRead("patients")).toBe(true);
    expect(auth.canWrite("patients")).toBe(false);
  });

  it("com mapa: Recados, Configurações e Contas seguem o cargo", () => {
    const auth = entrar("socio", TUDO_NENHUM);
    expect(auth.canRead("recados")).toBe(true);
    expect(auth.canWrite("recados")).toBe(true);
    expect(auth.canRead("config")).toBe(true);
    expect(auth.canWrite("config")).toBe(false);
    expect(auth.canWrite("admin")).toBe(false);
  });

  it("homeRoute acompanha o mapa: primeira página legível, /recados com tudo 'nenhum'", () => {
    expect(entrar("operacional", { processos: "nenhum", pagamentos: "ver" }).homeRoute()).toBe("/pagamentos");
    expect(entrar("socio", TUDO_NENHUM).homeRoute()).toBe("/recados");
  });

  it("consultor e administrador ignoram o mapa", () => {
    const adm = entrar("administrador", TUDO_NENHUM);
    expect(adm.canWrite("pagamentos")).toBe(true);
    expect(adm.homeRoute()).toBe("/processos");
    const consultor = entrar("consultor", TUDO_NENHUM);
    expect(consultor.canRead("processos")).toBe(true);
    expect(consultor.canWrite("processos")).toBe(false);
  });

  it("é reativo: trocar o usuário (ex.: recarregar /api/auth/me) muda a decisão", () => {
    const auth = entrar("operacional");
    expect(auth.canWrite("processos")).toBe(true);
    entrar("operacional", { processos: "ver", pagamentos: "nenhum", patients: "nenhum" });
    expect(auth.canWrite("processos")).toBe(false);
  });
});
