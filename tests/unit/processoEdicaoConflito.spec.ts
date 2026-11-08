// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App, type Ref } from "vue";
import type { Processo, ProcessoFormPatchPayload } from "#shared/types/processo";
import ProcessoFormModal from "../../app/components/processos/ProcessoFormModal.vue";
import {
  MENSAGEM_CONFLITO_EDICAO,
  useConflitoEdicaoProcesso,
  type ResultadoRecarregarEdicao,
  type ResultadoSalvarEdicao,
} from "../../app/composables/useConflitoEdicaoProcesso";
import { useProcessos } from "../../app/composables/useProcessos";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { linhaCompleta } from "./helpers/processoEdicaoFixtures";

// Item 12 — formulário de EDIÇÃO diante de um conflito de versão. Componentes e composables REAIS
// (ProcessoFormModal, useProcessoForm, useConflitoEdicaoProcesso, useProcessos) no happy-dom; só o `fetch` é
// simulado. O "harness" abaixo repete a cola que app/pages/processos.vue faz entre o modal e o composable
// (a página em si não é montada em testes unitários, como nos demais specs de processos).

const V1 = "2026-11-08T10:00:00.000001+00:00"; // versão que a pessoa viu ao abrir
const V2 = "2026-11-08T10:05:00.000002+00:00"; // alguém gravou depois
const V3 = "2026-11-08T10:06:00.000003+00:00"; // a gravação desta pessoa, se passar

const processoNaVersao = (versao: string, extra: Record<string, unknown> = {}): Processo =>
  montarProcesso(linhaCompleta({ updated_at: versao, ...extra }) as unknown as FollowUpRow);

// ── fetch simulado ────────────────────────────────────────────────────────────────────────────────────
interface Chamada {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
}
const servidor = {
  // o que o servidor tem AGORA (devolvido pelo GET de recarga)
  atual: processoNaVersao(V1) as Processo | null,
  // resposta do PATCH: função que decide (status HTTP + corpo)
  patch: (_c: Chamada): { status: number; corpo: unknown } => ({ status: 200, corpo: {} }),
  derrubarRedeNoGet: false,
  chamadas: [] as Chamada[],
};

function resposta(status: number, corpo: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

async function fetchFalso(url: string, opts?: RequestInit): Promise<Response> {
  const chamada: Chamada = {
    url,
    method: opts?.method ?? "GET",
    body: opts?.body ? (JSON.parse(String(opts.body)) as Record<string, unknown>) : undefined,
  };
  servidor.chamadas.push(chamada);
  if (chamada.method === "PATCH") {
    const r = servidor.patch(chamada);
    return resposta(r.status, r.corpo);
  }
  if (chamada.method === "GET" && /^\/api\/processos\/[^/]+$/.test(url)) {
    if (servidor.derrubarRedeNoGet) throw new TypeError("Failed to fetch");
    return servidor.atual ? resposta(200, servidor.atual) : resposta(404, { statusMessage: "Processo não encontrado." });
  }
  throw new Error(`fetch inesperado: ${chamada.method} ${url}`);
}

const patches = () => servidor.chamadas.filter((c) => c.method === "PATCH");
const gets = () => servidor.chamadas.filter((c) => c.method === "GET");

// ── montagem ──────────────────────────────────────────────────────────────────────────────────────────
let app: App | null = null;
let raiz: HTMLElement | null = null;
let editando: Ref<Processo | null>;
let resultadosSalvar: ResultadoSalvarEdicao[] = [];
let resultadosRecarregar: ResultadoRecarregarEdicao[] = [];
let errosSalvar: unknown[] = [];
let errosRecarregar: unknown[] = [];

async function esperar(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
  }
}

const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

async function abrirEdicao(processo: Processo): Promise<void> {
  // A lista do app (de onde a página tira o processo) já tem o processo, como na tela real.
  useProcessos().processos.value = [processo];
  editando = ref(processo) as Ref<Processo | null>;

  const Harness = defineComponent({
    setup() {
      const { conflito, recarregando, salvar, recarregar } = useConflitoEdicaoProcesso(editando);
      // Mesma cola de processos.vue (handleUpdate / handleRecarregarEdicao), sem toast/closeForm.
      async function onUpdate(id: string, payload: ProcessoFormPatchPayload): Promise<void> {
        try {
          resultadosSalvar.push(await salvar(id, payload));
        } catch (e) {
          errosSalvar.push(e);
        }
      }
      async function onRecarregar(): Promise<void> {
        try {
          resultadosRecarregar.push(await recarregar());
        } catch (e) {
          errosRecarregar.push(e);
        }
      }
      return () =>
        h(ProcessoFormModal, {
          editingProcesso: editando.value,
          conflito: conflito.value,
          recarregando: recarregando.value,
          onUpdate,
          onRecarregar,
        });
    },
  });

  raiz = document.createElement("div");
  document.body.appendChild(raiz);
  app = createApp(Harness);
  app.mount(raiz);
  await esperar();
}

function campoPendencia(valor: string): HTMLInputElement {
  const campo = Array.from(document.querySelectorAll<HTMLInputElement>("#processo-form input")).find(
    (i) => i.value === valor,
  );
  if (!campo) throw new Error(`campo com o valor "${valor}" não encontrado`);
  return campo;
}

function digitar(campo: HTMLInputElement, valor: string): void {
  campo.value = valor;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
}

async function salvarFormulario(): Promise<void> {
  $("#processo-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await esperar();
}

async function clicarRecarregar(): Promise<void> {
  $<HTMLButtonElement>("#btn-recarregar-processo")!.click();
  await esperar();
}

beforeEach(() => {
  servidor.atual = processoNaVersao(V1);
  servidor.patch = () => ({ status: 200, corpo: processoNaVersao(V3) });
  servidor.derrubarRedeNoGet = false;
  servidor.chamadas = [];
  resultadosSalvar = [];
  resultadosRecarregar = [];
  errosSalvar = [];
  errosRecarregar = [];
  vi.stubGlobal("fetch", vi.fn(fetchFalso));
});

afterEach(() => {
  app?.unmount();
  raiz?.remove();
  app = null;
  raiz = null;
  vi.unstubAllGlobals();
  useProcessos().processos.value = [];
});

describe("o formulário envia a versão de ABERTURA", () => {
  it("mudou pendência: vai `versao` = updatedAt de quando o modal abriu, junto com `parcial`", async () => {
    await abrirEdicao(processoNaVersao(V1));

    digitar(campoPendencia("Enviar laudo"), "Enviar laudo e receita");
    await salvarFormulario();

    expect(patches()).toHaveLength(1);
    expect(patches()[0]!.url).toBe("/api/processos/proc_1");
    expect(patches()[0]!.body).toEqual({ pendencias: ["Enviar laudo e receita"], parcial: true, versao: V1 });
  });

  it("a lista do app ganhou versão nova DEPOIS de abrir (ex.: alerta resolvido no sino): continua indo a de abertura", async () => {
    await abrirEdicao(processoNaVersao(V1));

    // Outro caminho (sino, "chegou?") grava o processo e a lista do app troca o elemento por V2. O modal não é
    // reaberto: ele continua com o processo de V1.
    useProcessos().processos.value[0] = processoNaVersao(V2);
    expect(useProcessos().processos.value[0]!.updatedAt).toBe(V2);

    digitar(campoPendencia("Enviar laudo"), "Outra");
    await salvarFormulario();

    expect(patches()[0]!.body!.versao).toBe(V1); // NUNCA a V2: senão a conferência não veria o conflito
  });

  it("mudou medicamento: também vai com a versão de abertura", async () => {
    await abrirEdicao(processoNaVersao(V1));

    digitar(campoPendencia("DROGA"), "DROGA 2");
    await salvarFormulario();

    expect(patches()[0]!.body).toMatchObject({ medicamentos: [{ nome: "DROGA 2" }], parcial: true, versao: V1 });
  });

  it("só campo simples (sem lista): NÃO leva `versao`", async () => {
    await abrirEdicao(processoNaVersao(V1));

    digitar(campoPendencia("Clínica X"), "Clínica Y");
    await salvarFormulario();

    expect(patches()).toHaveLength(1);
    expect(patches()[0]!.body).toEqual({ localEntrega: "Clínica Y", parcial: true });
    expect(patches()[0]!.body).not.toHaveProperty("versao");
  });

  it("sem alteração nenhuma: nada é enviado", async () => {
    await abrirEdicao(processoNaVersao(V1));
    await salvarFormulario();
    expect(patches()).toHaveLength(0);
  });
});

describe("409: o modal fica aberto, avisa e preserva o que foi digitado", () => {
  beforeEach(() => {
    servidor.patch = () => ({
      status: 409,
      corpo: { statusMessage: "Este processo foi alterado por outra pessoa. Recarregue e tente de novo." },
    });
  });

  it("sem conflito, não há aviso nem botão de recarregar", async () => {
    await abrirEdicao(processoNaVersao(V1));
    expect($("#processo-conflito-aviso")).toBeNull();
    expect($("#btn-recarregar-processo")).toBeNull();
  });

  it("mostra a mensagem combinada e o botão 'Recarregar dados atuais'; o modal segue aberto", async () => {
    await abrirEdicao(processoNaVersao(V1));
    digitar(campoPendencia("Enviar laudo"), "Minha pendência");
    await salvarFormulario();

    expect(resultadosSalvar).toEqual([{ tipo: "conflito" }]);
    expect(errosSalvar).toEqual([]);
    expect($("#processo-form")).not.toBeNull(); // o modal continua aberto
    expect($("#processo-conflito-aviso")!.getAttribute("role")).toBe("alert");
    expect(texto($("#processo-conflito-texto"))).toBe(
      "Este processo foi alterado por outra pessoa enquanto você editava. Recarregue para ver a versão atual e refaça sua alteração.",
    );
    expect(MENSAGEM_CONFLITO_EDICAO).toBe(texto($("#processo-conflito-texto")));
    expect(texto($("#btn-recarregar-processo"))).toBe("Recarregar dados atuais");
  });

  it("o texto digitado fica intacto (inclusive nos campos que não são do patch)", async () => {
    await abrirEdicao(processoNaVersao(V1));
    digitar(campoPendencia("Enviar laudo"), "Minha pendência");
    digitar(campoPendencia("Clínica X"), "Clínica Y");
    await salvarFormulario();

    expect($("#processo-conflito-aviso")).not.toBeNull();
    expect(campoPendencia("Minha pendência").value).toBe("Minha pendência");
    expect(campoPendencia("Clínica Y").value).toBe("Clínica Y");
  });

  it("NÃO existe 'salvar mesmo assim': o único botão do aviso é o de recarregar", async () => {
    await abrirEdicao(processoNaVersao(V1));
    digitar(campoPendencia("Enviar laudo"), "Minha pendência");
    await salvarFormulario();

    const botoes = Array.from($("#processo-conflito-aviso")!.querySelectorAll("button"));
    expect(botoes.map((b) => b.id)).toEqual(["btn-recarregar-processo"]);
    expect(texto($("#processo-conflito-aviso")).toLowerCase()).not.toContain("mesmo assim");
  });

  it("salvar de novo sem recarregar reenvia a MESMA versão velha (dá 409 outra vez; nada sobrescreve)", async () => {
    await abrirEdicao(processoNaVersao(V1));
    digitar(campoPendencia("Enviar laudo"), "Minha pendência");
    await salvarFormulario();
    await salvarFormulario();

    expect(patches().map((p) => p.body!.versao)).toEqual([V1, V1]);
    expect(resultadosSalvar).toEqual([{ tipo: "conflito" }, { tipo: "conflito" }]);
  });

  it("o conflito não troca o processo da lista do app", async () => {
    await abrirEdicao(processoNaVersao(V1));
    digitar(campoPendencia("Enviar laudo"), "Minha pendência");
    await salvarFormulario();

    expect(useProcessos().processos.value[0]!.pendencias).toEqual(["Enviar laudo"]);
    expect(useProcessos().processos.value[0]!.updatedAt).toBe(V1);
  });

  it("outro erro (500) NÃO vira aviso de conflito: é repassado a quem chamou", async () => {
    servidor.patch = () => ({ status: 500, corpo: { statusMessage: "Erro interno" } });
    await abrirEdicao(processoNaVersao(V1));
    digitar(campoPendencia("Enviar laudo"), "Minha pendência");
    await salvarFormulario();

    expect(resultadosSalvar).toEqual([]);
    expect(errosSalvar).toHaveLength(1);
    expect((errosSalvar[0] as Error).message).toBe("Erro interno");
    expect($("#processo-conflito-aviso")).toBeNull();
  });

  it("409 de um PATCH SEM versão (campo simples) não é tratado como conflito de edição", async () => {
    await abrirEdicao(processoNaVersao(V1));
    digitar(campoPendencia("Clínica X"), "Clínica Y");
    await salvarFormulario();

    expect(patches()[0]!.body).not.toHaveProperty("versao");
    expect(resultadosSalvar).toEqual([]);
    expect(errosSalvar).toHaveLength(1);
    expect($("#processo-conflito-aviso")).toBeNull();
  });
});

describe("'Recarregar dados atuais'", () => {
  // Quem gravou no meio tempo: pendência nova, e a linha ganhou a versão V2.
  const DO_OUTRO = (): Processo => processoNaVersao(V2, { pendencias: ["Pendência do outro"] });

  async function chegarNoConflito(): Promise<void> {
    servidor.patch = () => ({
      status: 409,
      corpo: { statusMessage: "Este processo foi alterado por outra pessoa. Recarregue e tente de novo." },
    });
    servidor.atual = DO_OUTRO();
    await abrirEdicao(processoNaVersao(V1));
    digitar(campoPendencia("Enviar laudo"), "Minha pendência");
    await salvarFormulario();
    expect($("#processo-conflito-aviso")).not.toBeNull();
  }

  it("busca a linha atual, atualiza o formulário com ela e descarta o que estava sendo editado", async () => {
    await chegarNoConflito();
    await clicarRecarregar();

    expect(gets().map((g) => g.url)).toEqual(["/api/processos/proc_1"]);
    expect(resultadosRecarregar).toEqual([{ tipo: "recarregado" }]);
    // o formulário agora mostra o que está no servidor...
    expect(campoPendencia("Pendência do outro").value).toBe("Pendência do outro");
    // ...e o que a pessoa tinha digitado se foi
    expect(Array.from(document.querySelectorAll<HTMLInputElement>("#processo-form input")).some((i) => i.value === "Minha pendência")).toBe(false);
    expect($("#processo-conflito-aviso")).toBeNull();
    expect(useProcessos().processos.value[0]!.pendencias).toEqual(["Pendência do outro"]);
    expect(useProcessos().processos.value[0]!.updatedAt).toBe(V2);
  });

  it("depois de recarregar, o próximo salvamento usa a versão NOVA (V2), não a de antes", async () => {
    await chegarNoConflito();
    await clicarRecarregar();

    servidor.patch = () => ({ status: 200, corpo: processoNaVersao(V3, { pendencias: ["Pendência do outro", "Refeita"] }) });
    digitar(campoPendencia("Pendência do outro"), "Pendência do outro e a minha");
    await salvarFormulario();

    expect(patches()).toHaveLength(2);
    expect(patches()[1]!.body).toEqual({ pendencias: ["Pendência do outro e a minha"], parcial: true, versao: V2 });
    expect(resultadosSalvar.at(-1)).toEqual({ tipo: "salvo" });
  });

  it("o botão não pede confirmação: um clique recarrega (nenhum diálogo, uma única busca)", async () => {
    await chegarNoConflito();
    await clicarRecarregar();
    expect(gets()).toHaveLength(1);
    expect($("[role='dialog']")).toBeNull();
  });

  it("falha de rede ao recarregar: o aviso e o texto digitado ficam, e dá para tentar de novo", async () => {
    await chegarNoConflito();
    servidor.derrubarRedeNoGet = true;
    await clicarRecarregar();

    expect(errosRecarregar).toHaveLength(1);
    expect($("#processo-conflito-aviso")).not.toBeNull();
    expect(campoPendencia("Minha pendência").value).toBe("Minha pendência");
    expect(($("#btn-recarregar-processo") as HTMLButtonElement).disabled).toBe(false);

    servidor.derrubarRedeNoGet = false;
    await clicarRecarregar();
    expect($("#processo-conflito-aviso")).toBeNull();
    expect(campoPendencia("Pendência do outro")).toBeTruthy();
  });

  it("o processo foi excluído enquanto o formulário estava aberto: recarregar devolve 'removido' e o tira da lista", async () => {
    await chegarNoConflito();
    servidor.atual = null; // o GET responde 404
    await clicarRecarregar();

    expect(resultadosRecarregar).toEqual([{ tipo: "removido" }]);
    expect(useProcessos().processos.value).toEqual([]);
  });
});
