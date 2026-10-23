import { afterEach, describe, expect, it } from "vitest";
import { assertSupabaseLocal, urlEhLocal } from "../e2e/_guards/supabaseLocal";

// Guarda dos specs e2e: só segue com Supabase de loopback (harness local).

describe("urlEhLocal", () => {
  it("aceita só loopback", () => {
    expect(urlEhLocal("http://localhost:54511")).toBe(true);
    expect(urlEhLocal("http://127.0.0.1:54321")).toBe(true);
    expect(urlEhLocal("http://[::1]:54321")).toBe(true);
  });

  it("recusa produção, domínios parecidos, vazio e lixo", () => {
    expect(urlEhLocal("https://abcdefgh.supabase.co")).toBe(false);
    expect(urlEhLocal("https://localhost.evil.com")).toBe(false);
    expect(urlEhLocal("http://127.0.0.1.evil.com")).toBe(false);
    expect(urlEhLocal("")).toBe(false);
    expect(urlEhLocal("não é url")).toBe(false);
  });
});

describe("assertSupabaseLocal", () => {
  const original = process.env.NUXT_PUBLIC_SUPABASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.NUXT_PUBLIC_SUPABASE_URL;
    else process.env.NUXT_PUBLIC_SUPABASE_URL = original;
  });

  it("não lança com a URL local do harness", () => {
    process.env.NUXT_PUBLIC_SUPABASE_URL = "http://localhost:54511";
    expect(() => assertSupabaseLocal()).not.toThrow();
  });

  it("ABORTA com a URL de produção e nomeia o host na mensagem", () => {
    process.env.NUXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co";
    expect(() => assertSupabaseLocal()).toThrow(/abcdefgh\.supabase\.co.*não é local/);
  });
});
