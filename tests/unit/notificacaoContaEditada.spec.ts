import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampoContaEditado } from "../../shared/types/conta";

// Fan-out de "conta editada": só administradores, nunca quem editou, uma linha por administrador num
// único INSERT, uma mensagem por campo e nenhum dado sensível no texto. O Supabase é simulado.
const h = vi.hoisted(() => ({
  contas: [] as unknown[],
  insert: vi.fn(),
  insertError: null as { message: string } | null,
}));

vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => ({
    auth: { admin: { listUsers: async () => ({ data: { users: h.contas, nextPage: null }, error: null }) } },
    from: () => ({
      insert: async (rows: unknown) => {
        h.insert(rows);
        return { error: h.insertError };
      },
    }),
  }),
}));

const { mensagemContaEditada, notificarAdministradores, notificarContaEditada } = await import(
  "../../server/utils/notificacoesStore"
);

function conta(id: string, role: string | undefined, email = `${id}@farmaurora.com.br`) {
  return { id, email, app_metadata: role ? { role } : {}, created_at: "2026-01-01T00:00:00Z" };
}

interface Linha {
  id: string;
  destinatario_id: string;
  tipo: string;
  recado_id: string | null;
  mensagem: string;
  lida: boolean;
}
const linhasInseridas = (): Linha[] => h.insert.mock.calls[0]![0] as Linha[];

beforeEach(() => {
  h.insert.mockReset();
  h.insertError = null;
  h.contas = [
    conta("adm-autor", "administrador"),
    conta("adm-b", "administrador"),
    conta("adm-c", "administrador"),
    conta("socio-1", "socio"),
    conta("op-1", "operacional"),
    conta("cons-1", "consultor"),
  ];
});

describe("mensagemContaEditada — um texto por campo, sem valores", () => {
  it.each<[CampoContaEditado, string]>([
    ["senha", "Fulano de Tal editou a senha"],
    ["nome", "Fulano de Tal editou o nome"],
    ["email", "Fulano de Tal editou o e-mail"],
  ])("%s", (campo, esperado) => {
    expect(mensagemContaEditada("Fulano de Tal", campo)).toBe(esperado);
  });

  it("nome com quebra de linha/espaços repetidos (conta antiga) vira uma linha só; sem nome usa 'Uma conta'", () => {
    expect(mensagemContaEditada("Ana\nMaria" + String.fromCharCode(0x2028) + "  Souza", "senha")).toBe("Ana Maria Souza editou a senha");
    expect(mensagemContaEditada("  \n ", "nome")).toBe("Uma conta editou o nome");
  });
});

describe("notificarAdministradores", () => {
  it("só administradores, exceto quem editou — em UM insert, uma linha por admin", async () => {
    const total = await notificarAdministradores("adm-autor", "Fulano editou a senha");

    expect(total).toBe(2);
    expect(h.insert).toHaveBeenCalledTimes(1);
    const linhas = linhasInseridas();
    expect(linhas.map((l) => l.destinatario_id).sort()).toEqual(["adm-b", "adm-c"]);
    for (const l of linhas) {
      expect(l).toMatchObject({
        tipo: "conta_editada",
        recado_id: null,
        mensagem: "Fulano editou a senha",
        lida: false,
      });
      expect(l.id).toMatch(/^notif_/);
    }
  });

  it("sócio, operacional e consultor nunca recebem", async () => {
    await notificarAdministradores("adm-autor", "x");
    const destinos = linhasInseridas().map((l) => l.destinatario_id);
    expect(destinos).not.toContain("socio-1");
    expect(destinos).not.toContain("op-1");
    expect(destinos).not.toContain("cons-1");
  });

  it("autor é o único administrador → nada é inserido", async () => {
    h.contas = [conta("adm-autor", "administrador"), conta("socio-1", "socio")];
    expect(await notificarAdministradores("adm-autor", "x")).toBe(0);
    expect(h.insert).not.toHaveBeenCalled();
  });

  it("autor não-administrador (ex.: sócio) notifica todos os administradores", async () => {
    expect(await notificarAdministradores("socio-1", "x")).toBe(3);
  });

  it("LACUNA CONHECIDA: admin só pelo fallback NUXT_ADMIN_EMAILS (sem cargo gravado) NÃO recebe", async () => {
    h.contas = [
      conta("adm-autor", "administrador"),
      conta("adm-b", "administrador"),
      conta("adm-por-email", undefined, "admin@farmaurora.com.br"),
    ];
    await notificarAdministradores("adm-autor", "x");
    expect(linhasInseridas().map((l) => l.destinatario_id)).toEqual(["adm-b"]);
  });

  it("falha no insert rejeita (quem chama decide não desfazer a edição)", async () => {
    h.insertError = { message: "invalid input value for enum tipo_notificacao" };
    await expect(notificarAdministradores("adm-autor", "x")).rejects.toThrow(/notificações/);
  });
});

describe("notificarContaEditada", () => {
  it.each<[CampoContaEditado, string]>([
    ["senha", "Darlan editou a senha"],
    ["nome", "Darlan editou o nome"],
    ["email", "Darlan editou o e-mail"],
  ])("uma mensagem por campo (%s), sem e-mail nem valores", async (campo, esperado) => {
    await notificarContaEditada({ id: "adm-autor", nome: "Darlan" }, campo);

    const linhas = linhasInseridas();
    expect(linhas).toHaveLength(2);
    for (const l of linhas) {
      expect(l.mensagem).toBe(esperado);
      expect(l.mensagem).not.toContain("@");
    }
  });
});
