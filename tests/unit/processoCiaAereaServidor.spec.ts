import { beforeEach, describe, expect, it, vi } from "vitest";
import { validarProcessoForm } from "../../app/utils/processoFormPayload";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { ATUALIZACOES, MEDICAMENTOS, VERSAO, formCompleto, linhaCompleta } from "./helpers/processoEdicaoFixtures";

// Item 6 do lote Follow-Up — servidor: a cia aérea precisa combinar com o modal de envio.
// Handlers e store REAIS; só h3 (readBody/getRouterParam) e o Supabase (em memória) são simulados.

const h = vi.hoisted(() => ({ body: {} as unknown }));
const fake = new FakeSupabase();

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body), getRouterParam: vi.fn(() => "proc_1") };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { default: patchHandler } = await import("../../server/api/processos/[id].patch");
const { default: postHandler } = await import("../../server/api/processos/index.post");

const T = "follow_up";
const row = () => fake.linhas(T).find((r) => r.id === "proc_1")!;
const evento = { context: { user: null } } as unknown as Parameters<typeof patchHandler>[0];

async function patch(corpo: unknown) {
  h.body = JSON.parse(JSON.stringify(corpo)); // como na rede
  return patchHandler(evento);
}

function recusado(statusMessage: string) {
  return { statusCode: 400, statusMessage };
}

const ERRO_SEM_MODAL = "Escolha o modal antes da cia. aérea.";
const erroCia = (modal: string, opcoes: string) => `Cia. aérea inválida para o modal ${modal}. Opções: ${opcoes}.`;
const OPCOES_AIR = "Lufthansa, Emirates, Turkish, Qatar, Swiss";

// Linha armazenada de um dado antigo inconsistente (existe em produção).
const linhaAntiga = () => linhaCompleta({ modal_envio: "Courier Formal", companhia_aerea: "Swiss" });

beforeEach(() => {
  fake.tabelas[T] = [linhaCompleta()]; // Air Cargo + Lufthansa
  fake.chamadas.length = 0;
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("POST", () => {
  function corpo(modalEnvio: string, companhiaAerea: string): Record<string, unknown> {
    const r = validarProcessoForm({ ...formCompleto(), modalEnvio, companhiaAerea }, MEDICAMENTOS, [], "Poros - Turquia");
    if (!r.valido) throw new Error(r.erro);
    return { ...JSON.parse(JSON.stringify(r.payload)), atualizacoes: [] };
  }
  async function criar(c: Record<string, unknown>) {
    h.body = c;
    fake.tabelas[T] = [];
    return postHandler(evento);
  }

  it("cia válida para o modal: grava", async () => {
    const criado = await criar(corpo("Courier Formal", "DHL"));
    expect(fake.linhas(T)[0]!.companhia_aerea).toBe("DHL");
    expect(criado.companhiaAerea).toBe("DHL");
  });

  it("cia inválida para o modal: 400 com a lista de opções, e nada é gravado", async () => {
    await expect(criar(corpo("Courier Formal", "Swiss"))).rejects.toMatchObject(recusado(erroCia("Courier Formal", "FedEx, DHL")));
    await expect(criar(corpo("Air Cargo", "FedEx"))).rejects.toMatchObject(recusado(erroCia("Air Cargo", OPCOES_AIR)));
    expect(fake.linhas(T)).toHaveLength(0);
  });

  it("'Turkish Cargo' (nome antigo) é recusado: o nome agora é 'Turkish'", async () => {
    await expect(criar(corpo("Air Cargo", "Turkish Cargo"))).rejects.toMatchObject(recusado(erroCia("Air Cargo", OPCOES_AIR)));
    await criar(corpo("Air Cargo", "Turkish"));
    expect(fake.linhas(T)[0]!.companhia_aerea).toBe("Turkish");
  });

  it("cia preenchida sem modal: 400 'Escolha o modal antes da cia. aérea.'", async () => {
    await expect(criar({ ...corpo("", "Lufthansa") })).rejects.toMatchObject(recusado(ERRO_SEM_MODAL));
    const semModal = { ...corpo("Air Cargo", "Lufthansa") };
    delete semModal.modalEnvio;
    await expect(criar(semModal)).rejects.toMatchObject(recusado(ERRO_SEM_MODAL));
    expect(fake.linhas(T)).toHaveLength(0);
  });

  it("sem cia (opcional): grava com ou sem modal", async () => {
    // Sem cia, o insert nem leva a coluna (fica NULL no banco).
    await criar(corpo("Air Cargo", ""));
    expect(fake.linhas(T)[0]!.companhia_aerea ?? null).toBeNull();
    await criar(corpo("", ""));
    expect(fake.linhas(T)[0]!.companhia_aerea ?? null).toBeNull();
  });

  it("normaliza com trim e grava o valor canônico; só espaços = sem cia", async () => {
    await criar({ ...corpo("Air Cargo", "Qatar"), companhiaAerea: "  Qatar  " });
    expect(fake.linhas(T)[0]!.companhia_aerea).toBe("Qatar");

    await criar({ ...corpo("Air Cargo", ""), companhiaAerea: "   " });
    expect(fake.linhas(T)[0]!.companhia_aerea ?? null).toBeNull();
  });

  it("diferença de maiúsculas é recusada (correspondência exata)", async () => {
    await expect(criar({ ...corpo("Air Cargo", "Qatar"), companhiaAerea: "qatar" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("cia que não é texto: 400", async () => {
    await expect(criar({ ...corpo("Air Cargo", ""), companhiaAerea: 123 })).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("PATCH com `parcial: true`", () => {
  describe("(1) patch sem modal e sem cia: nunca valida a cia", () => {
    it("dado antigo inválido (Courier Formal + Swiss) não bloqueia editar outros campos", async () => {
      fake.tabelas[T] = [linhaAntiga()];
      await patch({ parcial: true, localEntrega: "Clínica nova", numeroAwb: "AWB-9" });
      expect(row().local_entrega).toBe("Clínica nova");
      expect(row().modal_envio).toBe("Courier Formal");
      expect(row().companhia_aerea).toBe("Swiss");
    });

    it("'Turkish Cargo' armazenado (valor antigo) também não bloqueia", async () => {
      fake.tabelas[T] = [linhaCompleta({ companhia_aerea: "Turkish Cargo" })];
      await patch({ parcial: true, localEntrega: "X" });
      expect(row().local_entrega).toBe("X");
      expect(row().companhia_aerea).toBe("Turkish Cargo");
    });

    it("cia armazenada sem modal armazenado, editando outro campo: passa", async () => {
      fake.tabelas[T] = [linhaCompleta({ modal_envio: null, companhia_aerea: "Swiss" })];
      await patch({ parcial: true, localEntrega: "X" });
      expect(row().local_entrega).toBe("X");
    });

    it("patch versionado (atualizações) sem modal/cia também passa com dado antigo inválido", async () => {
      fake.tabelas[T] = [linhaAntiga()];
      const novas = [...ATUALIZACOES, { data: "", texto: "Nova" }];
      await patch({ atualizacoes: novas, versao: VERSAO });
      expect(row().atualizacoes).toEqual(novas);
    });
  });

  describe("(2) patch só com modal: valida a cia ARMAZENADA contra o novo modal", () => {
    it("modal incompatível com a cia armazenada: 400 e nada muda", async () => {
      await expect(patch({ parcial: true, modalEnvio: "Courier Formal" })).rejects.toMatchObject(
        recusado(erroCia("Courier Formal", "FedEx, DHL")),
      );
      expect(row().modal_envio).toBe("Air Cargo");
      expect(row().companhia_aerea).toBe("Lufthansa");
    });

    it("modal compatível com a cia armazenada: grava", async () => {
      fake.tabelas[T] = [linhaCompleta({ modal_envio: "Courier Formal", companhia_aerea: "FedEx" })];
      await patch({ parcial: true, modalEnvio: "Courier Simples" });
      expect(row().modal_envio).toBe("Courier Simples");
      expect(row().companhia_aerea).toBe("FedEx");
    });

    it("sem cia armazenada: qualquer modal serve", async () => {
      fake.tabelas[T] = [linhaCompleta({ companhia_aerea: null })];
      await patch({ parcial: true, modalEnvio: "Courier Formal" });
      expect(row().modal_envio).toBe("Courier Formal");
    });

    it("dado antigo inválido: mexer só no modal obriga a conferir a cia (Swiss no Courier Simples: 400)", async () => {
      fake.tabelas[T] = [linhaAntiga()];
      await expect(patch({ parcial: true, modalEnvio: "Courier Simples" })).rejects.toMatchObject(
        recusado(erroCia("Courier Simples", "FedEx, DHL")),
      );
    });
  });

  describe("(3) patch só com cia: valida contra o modal ARMAZENADO", () => {
    it("cia válida: grava", async () => {
      await patch({ parcial: true, companhiaAerea: "Qatar" });
      expect(row().companhia_aerea).toBe("Qatar");
    });

    it("cia de outro modal: 400 e nada muda", async () => {
      await expect(patch({ parcial: true, companhiaAerea: "FedEx" })).rejects.toMatchObject(
        recusado(erroCia("Air Cargo", OPCOES_AIR)),
      );
      expect(row().companhia_aerea).toBe("Lufthansa");
    });

    it("'Turkish Cargo' e minúsculas: 400; 'Turkish' passa", async () => {
      await expect(patch({ parcial: true, companhiaAerea: "Turkish Cargo" })).rejects.toMatchObject({ statusCode: 400 });
      await expect(patch({ parcial: true, companhiaAerea: "qatar" })).rejects.toMatchObject({ statusCode: 400 });
      await patch({ parcial: true, companhiaAerea: "Turkish" });
      expect(row().companhia_aerea).toBe("Turkish");
    });

    it("grava o valor canônico (trim)", async () => {
      await patch({ parcial: true, companhiaAerea: "  Swiss " });
      expect(row().companhia_aerea).toBe("Swiss");
    });

    it("modal armazenado vazio: 400 'Escolha o modal antes da cia. aérea.'", async () => {
      fake.tabelas[T] = [linhaCompleta({ modal_envio: null, companhia_aerea: null })];
      await expect(patch({ parcial: true, companhiaAerea: "Lufthansa" })).rejects.toMatchObject(recusado(ERRO_SEM_MODAL));
    });
  });

  describe("(4) cia null/vazia: sempre permitida", () => {
    it.each([null, "", "   "])("cia %j limpa a coluna, mesmo com dado antigo inválido ou sem modal", async (cia) => {
      fake.tabelas[T] = [linhaAntiga()];
      await patch({ parcial: true, companhiaAerea: cia });
      expect(row().companhia_aerea).toBeNull();

      fake.tabelas[T] = [linhaCompleta({ modal_envio: null, companhia_aerea: "Swiss" })];
      await patch({ parcial: true, companhiaAerea: cia });
      expect(row().companhia_aerea).toBeNull();
    });
  });

  describe("(5) modal vazio/null com cia armazenada preenchida", () => {
    it.each([null, ""])("modal %j sem limpar a cia: 400", async (modal) => {
      await expect(patch({ parcial: true, modalEnvio: modal })).rejects.toMatchObject(recusado(ERRO_SEM_MODAL));
      expect(row().modal_envio).toBe("Air Cargo");
    });

    it.each([null, ""])("modal %j junto com a cia limpa: grava os dois", async (modal) => {
      await patch({ parcial: true, modalEnvio: modal, companhiaAerea: null });
      expect(row().modal_envio || null).toBeNull(); // (o modal "" é gravado como veio: comportamento já existente)
      expect(row().companhia_aerea).toBeNull();
    });

    it("modal null sem cia armazenada: grava", async () => {
      fake.tabelas[T] = [linhaCompleta({ companhia_aerea: null })];
      await patch({ parcial: true, modalEnvio: null });
      expect(row().modal_envio).toBeNull();
    });
  });

  describe("modal e cia juntos: valem os valores do patch", () => {
    it("novo modal + cia do novo modal: grava (mesmo com a cia armazenada incompatível)", async () => {
      await patch({ parcial: true, modalEnvio: "Courier Formal", companhiaAerea: "DHL" });
      expect(row().modal_envio).toBe("Courier Formal");
      expect(row().companhia_aerea).toBe("DHL");
    });

    it("novo modal + cia que não é dele: 400", async () => {
      await expect(patch({ parcial: true, modalEnvio: "Courier Formal", companhiaAerea: "Qatar" })).rejects.toMatchObject(
        recusado(erroCia("Courier Formal", "FedEx, DHL")),
      );
    });

    it("troca do dado antigo (Courier Formal + Swiss) para um par válido: grava", async () => {
      fake.tabelas[T] = [linhaAntiga()];
      await patch({ parcial: true, modalEnvio: "Air Cargo" }); // Swiss vale no Air Cargo
      expect(row().modal_envio).toBe("Air Cargo");
      await patch({ parcial: true, companhiaAerea: "FedEx" }).catch(() => undefined);
      expect(row().companhia_aerea).toBe("Swiss"); // FedEx não vale no Air Cargo
    });

    it("patch versionado (atualizações) com cia inválida também é recusado", async () => {
      await expect(
        patch({ atualizacoes: ATUALIZACOES, versao: VERSAO, parcial: true, companhiaAerea: "FedEx" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("processo inexistente: 404 (a linha armazenada é lida antes)", async () => {
      fake.tabelas[T] = [];
      await expect(patch({ parcial: true, companhiaAerea: "Qatar" })).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("PATCH sem `parcial` (caminho antigo, abas velhas)", () => {
  it("reenvia tudo igual ao armazenado (dado antigo inválido): não valida, grava o resto", async () => {
    fake.tabelas[T] = [linhaAntiga()];
    await patch({ modalEnvio: "Courier Formal", companhiaAerea: "Swiss", localEntrega: "Clínica nova" });
    expect(row().local_entrega).toBe("Clínica nova");
    expect(row().companhia_aerea).toBe("Swiss");
  });

  it("'Turkish Cargo' armazenado e reenviado igual: não valida", async () => {
    fake.tabelas[T] = [linhaCompleta({ companhia_aerea: "Turkish Cargo" })];
    await patch({ modalEnvio: "Air Cargo", companhiaAerea: "Turkish Cargo", localEntrega: "X" });
    expect(row().local_entrega).toBe("X");
    expect(row().companhia_aerea).toBe("Turkish Cargo");
  });

  it("igual ao armazenado, ignorando espaços nas pontas: não valida", async () => {
    fake.tabelas[T] = [linhaAntiga()];
    await patch({ modalEnvio: "Courier Formal", companhiaAerea: " Swiss ", localEntrega: "X" });
    expect(row().local_entrega).toBe("X");
  });

  it("só o modal (cia não veio): se igual ao armazenado, não valida", async () => {
    fake.tabelas[T] = [linhaAntiga()];
    await patch({ modalEnvio: "Courier Formal", localEntrega: "X" });
    expect(row().local_entrega).toBe("X");
  });

  it("cia DIFERENTE do armazenado e inválida: 400", async () => {
    await expect(patch({ modalEnvio: "Air Cargo", companhiaAerea: "FedEx" })).rejects.toMatchObject(
      recusado(erroCia("Air Cargo", OPCOES_AIR)),
    );
    expect(row().companhia_aerea).toBe("Lufthansa");
  });

  it("cia diferente e válida: grava", async () => {
    await patch({ modalEnvio: "Air Cargo", companhiaAerea: "Emirates" });
    expect(row().companhia_aerea).toBe("Emirates");
  });

  it("modal DIFERENTE do armazenado, incompatível com a cia armazenada: 400", async () => {
    await expect(patch({ modalEnvio: "Courier Formal", companhiaAerea: "Lufthansa" })).rejects.toMatchObject(
      recusado(erroCia("Courier Formal", "FedEx, DHL")),
    );
    expect(row().modal_envio).toBe("Air Cargo");
  });

  it("modal diferente e cia que não veio (vale a armazenada): confere a armazenada", async () => {
    await expect(patch({ modalEnvio: "Courier Simples", localEntrega: "X" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("modal DIFERENTE e compatível: grava", async () => {
    fake.tabelas[T] = [linhaCompleta({ modal_envio: "Courier Formal", companhia_aerea: "FedEx" })];
    await patch({ modalEnvio: "Courier Simples", companhiaAerea: "FedEx" });
    expect(row().modal_envio).toBe("Courier Simples");
  });

  it("modal esvaziado (diferente do armazenado) com a cia armazenada: 400", async () => {
    await expect(patch({ modalEnvio: null, localEntrega: "X" })).rejects.toMatchObject(recusado(ERRO_SEM_MODAL));
  });

  it("sem modal e sem cia no corpo: nunca valida", async () => {
    fake.tabelas[T] = [linhaAntiga()];
    await patch({ localEntrega: "X" });
    expect(row().local_entrega).toBe("X");
  });
});
