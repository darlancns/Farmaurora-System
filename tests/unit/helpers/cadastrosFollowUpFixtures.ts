import type { CadastrosFollowUp, FornecedorLido, MedicamentoLido } from "../../../shared/types/Cadastro";
import type { ItemCadastroPagamento } from "../../../shared/types/Pagamento";

// Fixtures do que o Follow-Up LÊ dos Cadastros (useCadastrosFollowUp): fornecedores com país e prazo do alerta, despachantes e
// transportadoras. Os fornecedores e prazos são os de produção (Poros 3, Speciality 3, Beldimed 7, Pharyx 10); "Can Pharma" e "Venecza" são
// fornecedores do Cadastro SEM prazo definido (semAlerta), cujo legado no banco ainda está gravado sem país. Sem chave PIX, como no app.

const forn = (nome: string, pais: string, prazoAlertaDias: number | null, ativo = true): FornecedorLido => ({
  nome,
  pais,
  ativo,
  prazoAlertaDias,
  semAlerta: prazoAlertaDias === null,
});

export const FORNECEDORES_FIXTURE: FornecedorLido[] = [
  forn("Beldimed", "Bélgica", 7),
  forn("Can Pharma", "China", null),
  forn("Pharyx", "China", 10),
  forn("Poros", "Turquia", 3),
  forn("Speciality", "Índia", 3),
  forn("Venecza", "Itália", null),
  forn("TESTE Antigo", "Peru", null, false),
];

const item = (nome: string, ativo = true): ItemCadastroPagamento => ({ nome, ativo, pais: "" });

export const DESPACHANTES_FIXTURE: ItemCadastroPagamento[] = [item("STAR CUSTOMS"), item("SOUTH AMERICA"), item("TESTE Despachante Antigo", false)];

export const TRANSPORTADORAS_FIXTURE: ItemCadastroPagamento[] = [item("AJC"), item("Doctor"), item("TESTE Transportadora Beta"), item("TESTE Transportadora Antiga", false)];

// Medicamentos do Cadastro: só nome (já em MAIÚSCULAS, como o Cadastro grava) e ativo. Nomes de exemplo.
const med = (nome: string, ativo = true): MedicamentoLido => ({ nome, ativo });

export const MEDICAMENTOS_FIXTURE: MedicamentoLido[] = [
  med("DIPIRONA TESTE"),
  med("DIPIRONA TESTE GOTAS"),
  med("KEYTRUDA"),
  med("NIVOLUMABE"),
  med("OPDIVO"),
  med("XAROPE DIPIRONA TESTE"),
  med("TESTE MEDICAMENTO ANTIGO", false),
];

export const CADASTROS_FOLLOWUP_FIXTURE: CadastrosFollowUp = {
  fornecedores: FORNECEDORES_FIXTURE,
  despachantes: DESPACHANTES_FIXTURE,
  transportadoras: TRANSPORTADORAS_FIXTURE,
  medicamentos: MEDICAMENTOS_FIXTURE,
};
