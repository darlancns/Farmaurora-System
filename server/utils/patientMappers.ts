import type { EmpresaCodigo, ConsultorNome, MedicamentoItem, NewPatientDTO, Patient } from "../../shared/types/Patient";
import { num } from "./storeKit";

// Mapeadores puros linha (Supabase, tabela `prestacao_pacientes`) ↔ modelo
// Patient — sem Supabase/rede, testáveis isoladamente (ver
// tests/unit/patientMappers.spec.ts).
//
// Schema:
//  - `medicamentos`     jsonb: array de { qtd, medicamento } na ordem original;
//  - `remessas_itens`   jsonb: array de { despachante, transporte } na ordem
//                       original — `despachante` = despesasPorRemessa[i],
//                       `transporte` = transportesPorRemessa[i]; na leitura,
//                       volta a virar dois arrays paralelos.
//  - `consultor === ""` ↔ coluna `consultor = NULL`. `attachedSlots` ↔
//    `attached_slots` (text[]) direto.

export interface RemessaItem {
  despachante: string;
  transporte: string;
}

export interface PacienteRow {
  id: string;
  data: string;
  paciente: string;
  descricao_compra: string;
  descricao_resumo: string;
  empresa: EmpresaCodigo;
  consultor: ConsultorNome | null;
  alvara: number | string;
  custo_importacao: number | string;
  despesa_total: number | string;
  transporte_total: number | string;
  despachante_remessas: number | string;
  transporte_remessas: number | string;
  remessas: number | string;
  attached_slots: string[] | null;
  created_at: string;
  medicamentos: MedicamentoItem[] | null;
  remessas_itens: RemessaItem[] | null;
}

export function medicamentosParaColuna(dto: NewPatientDTO): MedicamentoItem[] {
  return dto.medicamentos.map((m) => ({ qtd: m.qtd, medicamento: m.medicamento }));
}

// despesasPorRemessa[i] + transportesPorRemessa[i] → { despachante, transporte }.
// N = maior dos dois; o lado curto é preenchido com "".
export function remessasItensParaColuna(dto: NewPatientDTO): RemessaItem[] {
  const n = Math.max(dto.despesasPorRemessa.length, dto.transportesPorRemessa.length);
  return Array.from({ length: n }, (_, i) => ({
    despachante: dto.despesasPorRemessa[i] ?? "",
    transporte: dto.transportesPorRemessa[i] ?? "",
  }));
}

// Campos comuns a create/update (sem id / created_at / attached_slots).
export function colunasComuns(dto: NewPatientDTO): Omit<
  PacienteRow,
  "id" | "created_at" | "attached_slots"
> {
  return {
    data: dto.data,
    paciente: dto.paciente,
    descricao_compra: dto.descricaoCompra,
    descricao_resumo: dto.descricaoResumo,
    empresa: dto.empresa,
    consultor: dto.consultor === "" ? null : dto.consultor,
    alvara: dto.alvara,
    custo_importacao: dto.custoImportacao,
    despesa_total: dto.despesaTotal,
    transporte_total: dto.transporteTotal,
    despachante_remessas: dto.despachanteRemessas,
    transporte_remessas: dto.transporteRemessas,
    remessas: dto.remessas,
    medicamentos: medicamentosParaColuna(dto),
    remessas_itens: remessasItensParaColuna(dto),
  };
}

// Linha do banco → objeto Patient (split de remessas_itens em dois arrays).
export function montarPatient(row: PacienteRow): Patient {
  const remessasItens = row.remessas_itens ?? [];
  return {
    id: row.id,
    data: row.data,
    paciente: row.paciente,
    descricaoCompra: row.descricao_compra,
    descricaoResumo: row.descricao_resumo,
    medicamentos: (row.medicamentos ?? []).map((m) => ({
      qtd: m.qtd,
      medicamento: m.medicamento,
    })),
    empresa: row.empresa,
    consultor: row.consultor ?? "",
    alvara: num(row.alvara),
    custoImportacao: num(row.custo_importacao),
    despesaTotal: num(row.despesa_total),
    transporteTotal: num(row.transporte_total),
    despachanteRemessas: num(row.despachante_remessas),
    transporteRemessas: num(row.transporte_remessas),
    despesasPorRemessa: remessasItens.map((r) => r.despachante ?? ""),
    transportesPorRemessa: remessasItens.map((r) => r.transporte ?? ""),
    remessas: num(row.remessas),
    attachedSlots: row.attached_slots ?? [],
    createdAt: row.created_at,
  };
}
