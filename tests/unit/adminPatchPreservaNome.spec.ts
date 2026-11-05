import { beforeEach, describe, expect, it, vi } from "vitest";
import { roleAppMetadata, roleAppMetadataEdicao } from "../../server/utils/authUser";
import type { AuthUser } from "../../shared/types/auth";

// PATCH /api/admin/users/:id não pode apagar o `nome` que a própria pessoa editou em "Minha conta"
// quando o corpo vem sem `nome`. roleAppMetadata (usado na CRIAÇÃO, onde o nome é obrigatório) continua
// como era — tests/unit/rbac.spec.ts cobre o contrato dele.
const h = vi.hoisted(() => ({ body: {} as unknown, updateUserById: vi.fn(), listUsers: vi.fn() }));

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body), getRouterParam: vi.fn(() => "alvo") };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => ({ auth: { admin: { updateUserById: h.updateUserById, listUsers: h.listUsers } } }),
}));

import patchHandler from "../../server/api/admin/users/[id].patch";

const admin: AuthUser = { id: "adm", email: "adm@x.com", role: "administrador", nome: "Adm", isAdmin: true };

async function chamar(body: unknown) {
  h.body = body;
  return patchHandler({ context: { user: admin } } as never);
}

beforeEach(() => {
  h.updateUserById.mockReset().mockResolvedValue({
    data: { user: { id: "alvo", email: "alvo@x.com", app_metadata: { role: "socio", nome: "Nome Editado" }, created_at: "" } },
    error: null,
  });
  h.listUsers.mockReset();
});

describe("roleAppMetadataEdicao", () => {
  it("nome omitido: a chave `nome` NÃO existe (merge raso preserva o atual)", () => {
    const meta = roleAppMetadataEdicao("socio");
    expect(meta).toEqual({ role: "socio", consultorNome: null });
    expect(meta).not.toHaveProperty("nome");
  });

  it("nome informado: grava o nome", () => {
    expect(roleAppMetadataEdicao("socio", undefined, "Ana")).toEqual({ role: "socio", consultorNome: null, nome: "Ana" });
  });

  it("consultor: mantém consultorNome; demais cargos: limpa consultorNome órfão (como antes)", () => {
    expect(roleAppMetadataEdicao("consultor", "Paulo Braga")).toEqual({ role: "consultor", consultorNome: "Paulo Braga" });
    expect(roleAppMetadataEdicao("operacional")).toMatchObject({ consultorNome: null });
  });

  it("roleAppMetadata (criação) segue gravando `nome: null` quando omitido", () => {
    expect(roleAppMetadata("operacional")).toEqual({ role: "operacional", consultorNome: null, nome: null });
  });
});

describe("PATCH /api/admin/users/:id", () => {
  it("sem `nome` no corpo → app_metadata enviado NÃO traz `nome` (não apaga o nome da pessoa)", async () => {
    await chamar({ role: "administrador" });
    const { app_metadata } = h.updateUserById.mock.calls[0]![1] as { app_metadata: Record<string, unknown> };
    expect(app_metadata).toEqual({ role: "administrador", consultorNome: null });
    expect(app_metadata).not.toHaveProperty("nome");
  });

  it("`nome` em branco no corpo (modal de edição sem validar) também preserva o nome atual", async () => {
    await chamar({ role: "administrador", nome: "   " });
    const { app_metadata } = h.updateUserById.mock.calls[0]![1] as { app_metadata: Record<string, unknown> };
    expect(app_metadata).not.toHaveProperty("nome");
  });

  it("com `nome` no corpo → grava o nome (comportamento de sempre)", async () => {
    await chamar({ role: "administrador", nome: " Novo Nome " });
    expect(h.updateUserById).toHaveBeenCalledWith("alvo", {
      app_metadata: { role: "administrador", consultorNome: null, nome: "Novo Nome" },
    });
  });
});
