// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { AuthUser } from "../../shared/types/auth";
import type { Cadastro } from "../../shared/types/Cadastro";
import CadastrosTab from "../../app/components/configuracoes/CadastrosTab.vue";
import { useState } from "./helpers/nuxtAppStub";

// A aba Cadastros inteira (componente real no happy-dom, fetch simulado): UM bloco (card) por lista, empilhados —
// Fornecedores, Despachantes e Cias aéreas —, cada um com título, botão "+ Novo …" e a lista; sem abas internas.

const BASE = { ativo: true, atualizadoPor: "", createdAt: "", updatedAt: "" };
const DADOS: Record<string, Cadastro[]> = {
  fornecedores: [{ ...BASE, id: "f1", nome: "Poros", pais: "Turquia", prazoAlertaDias: 3, semAlerta: false } as Cadastro],
  despachantes: [{ ...BASE, id: "d1", nome: "STAR CUSTOMS", contatoNome: "", telefone: "", email: "" } as Cadastro],
  transportadoras: [{ ...BASE, id: "t1", nome: "DHL" } as Cadastro],
  "cias-aereas": [{ ...BASE, id: "c1", nome: "Lufthansa" } as Cadastro],
};

const conta = (role: AuthUser["role"]): AuthUser => ({ id: "u1", email: "u@x.com", role, isAdmin: role === "administrador" });

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];
async function montar(role: AuthUser["role"]): Promise<void> {
  useState<AuthUser | null>("auth-user").value = conta(role);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(defineComponent({ render: () => h(CadastrosTab) }));
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  // onMounted dispara o fetch das 3 listas; espera as promessas assentarem.
  for (let i = 0; i < 10; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
}

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);

beforeEach(() => {
  useState<Record<string, Cadastro[]>>("cadastros").value = { fornecedores: [], despachantes: [], transportadoras: [], "cias-aereas": [] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const lista = String(url).replace("/api/cadastros/", "");
      return new Response(JSON.stringify(DADOS[lista] ?? []), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
});
afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  vi.unstubAllGlobals();
});

describe("CadastrosTab — blocos empilhados", () => {
  it("administrador: 4 blocos, nesta ordem, cada um com título, botão '+ Novo …' e a sua lista", async () => {
    await montar("administrador");
    const ids = [...document.querySelectorAll("#cadastros-tab > section")].map((s) => s.id);
    expect(ids).toEqual([
      "cadastro-bloco-fornecedores",
      "cadastro-bloco-despachantes",
      "cadastro-bloco-transportadoras",
      "cadastro-bloco-cias-aereas",
    ]);

    expect(texto(q("#cadastro-titulo-fornecedores"))).toBe("Fornecedores");
    expect(texto(q("#cadastro-titulo-despachantes"))).toBe("Despachantes");
    expect(texto(q("#cadastro-titulo-transportadoras"))).toBe("Transportadoras");
    expect(texto(q("#cadastro-titulo-cias-aereas"))).toBe("Cias aéreas");

    expect(texto(q("#btn-novo-cadastro-fornecedores"))).toBe("+ Novo fornecedor");
    expect(texto(q("#btn-novo-cadastro-despachantes"))).toBe("+ Novo despachante");
    expect(texto(q("#btn-novo-cadastro-transportadoras"))).toBe("+ Nova transportadora");
    expect(texto(q("#btn-novo-cadastro-cias-aereas"))).toBe("+ Nova cia aérea");

    // Cada item aparece no SEU bloco.
    expect(q("#cadastro-bloco-fornecedores #cadastro-row-fornecedores-f1")).not.toBeNull();
    expect(q("#cadastro-bloco-despachantes #cadastro-row-despachantes-d1")).not.toBeNull();
    expect(q("#cadastro-bloco-transportadoras #cadastro-row-transportadoras-t1")).not.toBeNull();
    expect(q("#cadastro-bloco-cias-aereas #cadastro-row-cias-aereas-c1")).not.toBeNull();
  });

  it("não há abas internas nem seletor de lista", async () => {
    await montar("administrador");
    expect(q('[role="radiogroup"]')).toBeNull();
    expect(q("#cadastro-lista-escolha")).toBeNull();
  });

  it("cada botão abre o modal da SUA lista (título com o gênero certo)", async () => {
    await montar("administrador");
    q<HTMLButtonElement>("#btn-novo-cadastro-cias-aereas")!.click();
    await nextTick();
    expect(texto(q("#cadastro-form-titulo"))).toBe("Nova cia aérea");
    expect(q("#cadastro-form-pais")).toBeNull();
    q<HTMLButtonElement>("#btn-cadastro-cancelar")!.click();
    await nextTick();
    expect(q("#cadastro-form-overlay")).toBeNull();

    q<HTMLButtonElement>("#btn-novo-cadastro-fornecedores")!.click();
    await nextTick();
    expect(texto(q("#cadastro-form-titulo"))).toBe("Novo fornecedor");
    expect(q("#cadastro-form-alerta")).not.toBeNull();
  });

  it("quem não escreve não vê nenhum botão '+ Novo …' nem o menu de ações (só leitura)", async () => {
    await montar("socio");
    expect(document.querySelectorAll("#cadastros-tab > section")).toHaveLength(4);
    expect(document.querySelectorAll("[id^='btn-novo-cadastro-']")).toHaveLength(0);
    expect(document.querySelectorAll("[id^='btn-acoes-cadastro-']")).toHaveLength(0);
  });
});
