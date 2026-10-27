import { describe, expect, it } from "vitest";
import { erro, MENSAGEM_FALHA_TRANSITORIA } from "../../server/utils/storeKit";

describe("erro (storeKit)", () => {
  it("PGRST303 vira 503 com a mensagem clara, em vez do Server Error genérico", () => {
    const e = erro("criar paciente", { message: "JWT claims validation failed", code: "PGRST303" }) as Error & {
      statusCode?: number;
      statusMessage?: string;
    };
    expect(e.statusCode).toBe(503);
    expect(e.statusMessage).toBe("Falha temporária. Tente novamente.");
    expect(MENSAGEM_FALHA_TRANSITORIA).toBe("Falha temporária. Tente novamente.");
  });

  it("qualquer outro erro mantém o formato de sempre", () => {
    const e = erro("criar paciente", { message: "duplicate key", code: "23505" });
    expect(e.message).toBe("Supabase: falha ao criar paciente — duplicate key");
    expect((e as { statusCode?: number }).statusCode).toBeUndefined();
  });

  it("sem code também mantém o formato de sempre", () => {
    expect(erro("listar", { message: "x" }).message).toBe("Supabase: falha ao listar — x");
  });
});
