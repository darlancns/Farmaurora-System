import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, createRouter, toWebHandler } from "h3";
import type { NewPatientDTO } from "#shared/types/Patient";
import {
  PATIENT_STATUS_LABEL,
  PATIENT_STATUS_VALUES,
  isPatientStatus,
  normalizarPatientStatus,
  proximoPatientStatus,
} from "#shared/constants/prestacaoStatus";
import { canWriteSection, isWriteMethod, sectionForApiPath, type Role } from "#shared/utils/rbac";
import { colunasComuns, montarPatient, type PacienteRow } from "../../server/utils/patientMappers";
import { isValidPatientStatusPayload } from "../../server/utils/patientValidation";
import { FakeSupabase } from "./helpers/fakeSupabase";

// Status da prestação (em_andamento | concluida): validação, mapeamento (linha sem status =>
// em_andamento), store e os endpoints PATCH /status e PUT. Supabase em memória; nada de rede.

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { createPatient, getPatient, listPatients, setPatientStatus, updatePatient } = await import(
  "../../server/utils/patientsStore"
);
const { default: statusHandler } = await import("../../server/api/patients/[id]/status.patch");
const { default: putHandler } = await import("../../server/api/patients/[id].put");

const T = "prestacao_pacientes";

function dto(overrides: Partial<NewPatientDTO> = {}): NewPatientDTO {
  return {
    data: "10/10/2026",
    paciente: "Maria Teste",
    descricaoCompra: "Compra de medicamentos",
    descricaoResumo: "Resumo",
    medicamentos: [{ qtd: "1", medicamento: "MED A" }],
    empresa: "FARMAURORA",
    consultor: "",
    alvara: 100,
    custoImportacao: 10,
    despesaTotal: 0,
    transporteTotal: 0,
    despachanteRemessas: 0,
    transporteRemessas: 0,
    despesasPorRemessa: [],
    transportesPorRemessa: [],
    remessas: 1,
    ...overrides,
  };
}

function linhaBanco(id: string, extra: Record<string, unknown> = {}): PacienteRow {
  return {
    id,
    ...colunasComuns(dto()),
    attached_slots: [],
    created_at: "2026-10-10T10:00:00.000Z",
    ...extra,
  };
}

const linha = (id: string) => fake.linhas(T).find((r) => r.id === id)!;

beforeEach(() => {
  fake.tabelas[T] = [];
  fake.chamadas.length = 0;
});

describe("status — enum, padrão e rótulos", () => {
  it("aceita exatamente os dois valores", () => {
    expect([...PATIENT_STATUS_VALUES]).toEqual(["em_andamento", "concluida"]);
    expect(isPatientStatus("em_andamento")).toBe(true);
    expect(isPatientStatus("concluida")).toBe(true);
  });

  it.each([undefined, null, "", "EM_ANDAMENTO", "Concluída", "concluída", "cancelada", 0, 1, true, {}, []])(
    "rejeita %j",
    (valor) => {
      expect(isPatientStatus(valor)).toBe(false);
    },
  );

  it("normalizar devolve o padrão (em_andamento) para ausente, nulo ou fora do enum", () => {
    for (const valor of [undefined, null, "", "lixo", 3]) {
      expect(normalizarPatientStatus(valor)).toBe("em_andamento");
    }
    expect(normalizarPatientStatus("concluida")).toBe("concluida");
    expect(normalizarPatientStatus("em_andamento")).toBe("em_andamento");
  });

  it("alterna entre os dois e tem rótulo para cada um", () => {
    expect(proximoPatientStatus("em_andamento")).toBe("concluida");
    expect(proximoPatientStatus("concluida")).toBe("em_andamento");
    expect(PATIENT_STATUS_LABEL).toEqual({ em_andamento: "Em andamento", concluida: "Concluída" });
  });
});

describe("isValidPatientStatusPayload (validação do servidor)", () => {
  it("aceita os dois valores", () => {
    expect(isValidPatientStatusPayload({ status: "em_andamento" })).toBe(true);
    expect(isValidPatientStatusPayload({ status: "concluida" })).toBe(true);
  });

  it.each([
    ["corpo ausente", undefined],
    ["null", null],
    ["string", "concluida"],
    ["objeto vazio", {}],
    ["valor desconhecido", { status: "cancelada" }],
    ["maiúsculas", { status: "CONCLUIDA" }],
    ["com acento", { status: "concluída" }],
    ["vazio", { status: "" }],
    ["número", { status: 1 }],
    ["array", { status: ["concluida"] }],
    ["nulo", { status: null }],
  ])("rejeita %s", (_nome, corpo) => {
    expect(isValidPatientStatusPayload(corpo)).toBe(false);
  });
});

describe("mapeamento linha ↔ Patient", () => {
  it("linha sem a chave status (anterior à migration) vira em_andamento", () => {
    const row = linhaBanco("p_1");
    expect("status" in row).toBe(false);
    expect(montarPatient(row).status).toBe("em_andamento");
  });

  it("status nulo ou inválido na linha vira em_andamento; válido é preservado", () => {
    expect(montarPatient(linhaBanco("p_1", { status: null })).status).toBe("em_andamento");
    expect(montarPatient(linhaBanco("p_1", { status: "xpto" })).status).toBe("em_andamento");
    expect(montarPatient(linhaBanco("p_1", { status: "concluida" })).status).toBe("concluida");
    expect(montarPatient(linhaBanco("p_1", { status: "em_andamento" })).status).toBe("em_andamento");
  });

  it("colunasComuns (create/update) nunca inclui status", () => {
    const comStatusExtra = { ...dto(), status: "concluida" } as unknown as NewPatientDTO;
    expect(Object.keys(colunasComuns(comStatusExtra))).not.toContain("status");
  });
});

describe("patientsStore — status", () => {
  it("createPatient não envia status (vale o DEFAULT do banco) e devolve em_andamento", async () => {
    const criado = await createPatient(dto());
    expect(criado.status).toBe("em_andamento");
    expect(Object.keys(linha(criado.id))).not.toContain("status");
  });

  it("listPatients e getPatient tratam linha sem status como em_andamento", async () => {
    fake.semear(T, [linhaBanco("p_1")]);
    expect((await listPatients())[0]!.status).toBe("em_andamento");
    expect((await getPatient("p_1"))!.status).toBe("em_andamento");
  });

  it("updatePatient (edição) não sobrescreve o status, nem quando o corpo traz um", async () => {
    fake.semear(T, [linhaBanco("p_1", { status: "concluida" })]);
    const editado = await updatePatient("p_1", {
      ...dto({ paciente: "Nome Editado" }),
      status: "em_andamento",
    } as unknown as NewPatientDTO);
    expect(editado!.paciente).toBe("Nome Editado");
    expect(editado!.status).toBe("concluida");
    expect(linha("p_1").status).toBe("concluida");
  });

  it("setPatientStatus grava só o status e devolve a prestação; id inexistente => null", async () => {
    fake.semear(T, [linhaBanco("p_1", { status: "em_andamento" })]);
    const antes = { ...linha("p_1") };

    const atualizado = await setPatientStatus("p_1", "concluida");
    expect(atualizado!.status).toBe("concluida");
    expect({ ...linha("p_1"), status: antes.status }).toEqual(antes);

    expect(await setPatientStatus("p_inexistente", "concluida")).toBeNull();
  });
});

// Endpoints reais (h3) sobre o store em memória. A autorização (403) é do middleware
// server/middleware/auth.ts, que só consulta shared/utils/rbac.ts — por isso o RBAC abaixo é
// verificado pelas mesmas funções (e, de ponta a ponta, em tests/e2e/prestacao-card.spec.ts).
const app = createApp();
const router = createRouter();
router.patch("/api/patients/:id/status", statusHandler);
router.put("/api/patients/:id", putHandler);
app.use(router);
const web = toWebHandler(app);

async function chamar(metodo: "PATCH" | "PUT", caminho: string, corpo?: unknown): Promise<Response> {
  return web(
    new Request(`http://localhost${caminho}`, {
      method: metodo,
      headers: { "content-type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    }),
  );
}

describe("PATCH /api/patients/:id/status", () => {
  it("200: grava e devolve a prestação com o novo status; alterna de volta", async () => {
    fake.semear(T, [linhaBanco("p_1")]);

    const r1 = await chamar("PATCH", "/api/patients/p_1/status", { status: "concluida" });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ id: "p_1", status: "concluida" });
    expect(linha("p_1").status).toBe("concluida");

    const r2 = await chamar("PATCH", "/api/patients/p_1/status", { status: "em_andamento" });
    expect(r2.status).toBe(200);
    expect(linha("p_1").status).toBe("em_andamento");
  });

  it.each([
    ["valor desconhecido", { status: "cancelada" }],
    ["valor com acento", { status: "concluída" }],
    ["campo ausente", {}],
    ["tipo errado", { status: 1 }],
  ])("400 (%s) e nada é gravado", async (_nome, corpo) => {
    fake.semear(T, [linhaBanco("p_1")]);
    const res = await chamar("PATCH", "/api/patients/p_1/status", corpo);
    expect(res.status).toBe(400);
    expect(fake.chamadas.some((c) => c.op === "update")).toBe(false);
    expect(Object.keys(linha("p_1"))).not.toContain("status");
  });

  it("400 sem corpo", async () => {
    fake.semear(T, [linhaBanco("p_1")]);
    expect((await chamar("PATCH", "/api/patients/p_1/status")).status).toBe(400);
  });

  it("404 para id inexistente", async () => {
    fake.semear(T, [linhaBanco("p_1")]);
    const res = await chamar("PATCH", "/api/patients/p_nao_existe/status", { status: "concluida" });
    expect(res.status).toBe(404);
    expect(Object.keys(linha("p_1"))).not.toContain("status");
  });
});

describe("PUT /api/patients/:id (edição) não mexe no status", () => {
  it("corpo com status é ignorado; o status salvo permanece", async () => {
    fake.semear(T, [linhaBanco("p_1", { status: "concluida" })]);
    const res = await chamar("PUT", "/api/patients/p_1", { ...dto({ paciente: "Outro Nome" }), status: "em_andamento" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ paciente: "Outro Nome", status: "concluida" });
    expect(linha("p_1").status).toBe("concluida");
  });
});

describe("RBAC do PATCH /status (cai nas regras de /api/patients, sem regra nova)", () => {
  it("o caminho pertence à seção patients e PATCH conta como escrita", () => {
    expect(sectionForApiPath("/api/patients/p_1/status")).toBe("patients");
    expect(isWriteMethod("PATCH")).toBe(true);
  });

  it.each<[Role, boolean]>([
    ["administrador", true],
    ["socio", true],
    ["operacional", false], // sem permissão => 403 no middleware
    ["consultor", false],
  ])("%s pode escrever em patients: %s", (cargo, pode) => {
    expect(canWriteSection(cargo, "patients")).toBe(pode);
  });
});
