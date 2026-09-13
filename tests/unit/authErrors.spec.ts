import { describe, it, expect } from "vitest";
import { AuthApiError, AuthWeakPasswordError } from "@supabase/supabase-js";
import { formatPasswordError } from "#shared/utils/authErrors";

const FALLBACK = "Não foi possível redefinir a senha. Tente novamente.";

describe("formatPasswordError", () => {
  it("traduz o reason 'length' isolado", () => {
    const error = new AuthWeakPasswordError("Password is too short", 422, ["length"]);
    expect(formatPasswordError(error, FALLBACK)).toBe("A senha está muito curta.");
  });

  it("traduz o reason 'pwned' isolado", () => {
    const error = new AuthWeakPasswordError("Password is known to be weak and easy to guess", 422, ["pwned"]);
    expect(formatPasswordError(error, FALLBACK)).toBe(
      "A senha já apareceu em vazamentos de dados conhecidos — escolha uma diferente.",
    );
  });

  it("junta múltiplos reasons numa frase só, não numa lista", () => {
    const error = new AuthWeakPasswordError("Password is too weak", 422, ["length", "characters"]);
    const message = formatPasswordError(error, FALLBACK);
    expect(message).toBe(
      "A senha está muito curta e precisa combinar letras maiúsculas, minúsculas, números e/ou símbolos.",
    );
    expect(message).not.toContain("\n");
    expect(message).not.toContain("•");
  });

  it("cai no error.message do Supabase quando reasons vem vazio", () => {
    const error = new AuthWeakPasswordError("Motivo específico do Supabase", 422, []);
    expect(formatPasswordError(error, FALLBACK)).toBe("Motivo específico do Supabase");
  });

  it("mantém o fallback do chamador pra erros que não são de senha fraca", () => {
    const error = new AuthApiError("Invalid login credentials", 400, "invalid_credentials");
    expect(formatPasswordError(error, FALLBACK)).toBe(FALLBACK);
  });

  it("mantém o fallback do chamador pra erros genéricos (rede, etc.)", () => {
    expect(formatPasswordError(new TypeError("Failed to fetch"), FALLBACK)).toBe(FALLBACK);
    expect(formatPasswordError(null, FALLBACK)).toBe(FALLBACK);
    expect(formatPasswordError(undefined, FALLBACK)).toBe(FALLBACK);
  });
});
