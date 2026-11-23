import { describe, expect, it } from "vitest";
import type { FornecedorLido } from "../../shared/types/Cadastro";
import type { Processo } from "../../shared/types/processo";
import { calcularNotificacoesFornecedor, fornecedoresParaAlerta, prazoDoFornecedorNoCadastro } from "../../app/utils/prazoFornecedor";
import { FORNECEDORES_FIXTURE } from "./helpers/cadastrosFollowUpFixtures";

// ETAPA 4: o alerta de prazo do fornecedor lê o CADASTRO (prazoAlertaDias / semAlerta) no lugar da tabela fixa. Mesmo comportamento para Poros (3),
// Speciality (3), Beldimed (7) e Pharyx (10); NENHUM alerta novo para os demais nem para "Nacional"; sem a lista do Cadastro (não carregou, falhou ou
// veio vazia) vale a tabela antiga como RESERVA. 08/09/2026, meio-dia em Brasília: o dia civil não depende do fuso da máquina. Nomes "TESTE".

const HOJE = new Date("2026-09-08T12:00:00-03:00");

// "DD/MM/AAAA" de hoje menos `dias` (aritmética de calendário, em UTC: não depende do fuso da máquina).
function compraHa(dias: number): string {
  const d = new Date(Date.UTC(2026, 8, 8 - dias));
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

let seq = 0;
function processo(fornecedor: string | undefined, diasDesdeACompra: number, extra: Partial<Processo> = {}): Processo {
  seq += 1;
  return {
    id: `proc_teste_${seq}`,
    paciente: `Paciente Teste ${seq}`,
    pasta: `2026 - ${seq}`,
    empresa: "FARMAURORA",
    consultor: "Dani",
    medicamentos: [],
    status: "elaboracao_fornecedores",
    datas: { dataCompraPO: compraHa(diasDesdeACompra) },
    pendencias: [],
    atualizacoes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...(fornecedor === undefined ? {} : { fornecedor }),
    ...extra,
  };
}

const forn = (nome: string, pais: string, prazoAlertaDias: number | null, extra: Partial<FornecedorLido> = {}): FornecedorLido => ({
  nome,
  pais,
  ativo: true,
  prazoAlertaDias,
  semAlerta: prazoAlertaDias === null,
  ...extra,
});

const alertas = (ps: Processo[], cadastro?: readonly FornecedorLido[] | null) => calcularNotificacoesFornecedor(ps, HOJE, cadastro);
const ids = (ps: Processo[], cadastro?: readonly FornecedorLido[] | null) => alertas(ps, cadastro).map((n) => n.processoId);

const OS_QUATRO: Array<[string, number]> = [
  ["Poros - Turquia", 3],
  ["Speciality - Índia", 3],
  ["Beldimed - Bélgica", 7],
  ["Pharyx - China", 10],
];

describe("com o Cadastro: o mesmo comportamento de sempre para Poros, Speciality, Beldimed e Pharyx", () => {
  it.each(OS_QUATRO)("%s: alerta no dia do prazo (%i dias), nenhum um dia antes", (nome, prazo) => {
    const noPrazo = processo(nome, prazo);
    const antes = processo(nome, prazo - 1);
    expect(ids([noPrazo, antes], FORNECEDORES_FIXTURE)).toEqual([noPrazo.id]);
    expect(alertas([noPrazo], FORNECEDORES_FIXTURE)[0]).toMatchObject({ fornecedor: nome, diasDeAtraso: 0 });
  });

  it.each(OS_QUATRO)("%s: o resultado é IDÊNTICO ao da tabela antiga, em vários dias de atraso", (nome, prazo) => {
    for (const dias of [0, prazo - 1, prazo, prazo + 1, prazo + 5, 60]) {
      const p = processo(nome, dias);
      expect(alertas([p], FORNECEDORES_FIXTURE), `${nome} ${dias} dias`).toEqual(alertas([p]));
    }
  });
});

describe("com o Cadastro: o prazo vem do Cadastro", () => {
  it("prazo diferente do antigo: vale o do Cadastro (Poros com 5 dias não alerta com 3)", () => {
    const cadastro = [forn("Poros", "Turquia", 5)];
    expect(ids([processo("Poros - Turquia", 3)], cadastro)).toEqual([]);
    expect(ids([processo("Poros - Turquia", 4)], cadastro)).toEqual([]);
    expect(alertas([processo("Poros - Turquia", 6)], cadastro)[0]).toMatchObject({ diasDeAtraso: 1 });
  });

  it("'semAlerta' e prazo nulo: nenhum alerta, por mais antigo que seja o processo", () => {
    expect(ids([processo("Can Pharma - China", 200)], FORNECEDORES_FIXTURE)).toEqual([]);
    expect(ids([processo("Poros - Turquia", 200)], [forn("Poros", "Turquia", null)])).toEqual([]);
    expect(ids([processo("Poros - Turquia", 200)], [forn("Poros", "Turquia", 3, { semAlerta: true })])).toEqual([]);
  });

  it("fornecedor do Cadastro que NÃO estava na tabela antiga, com prazo: passa a alertar (o Cadastro é a fonte)", () => {
    const cadastro = [forn("TESTE Novo", "Chile", 4)];
    expect(ids([processo("TESTE Novo - Chile", 4)], cadastro)).toHaveLength(1);
    expect(ids([processo("TESTE Novo - Chile", 3)], cadastro)).toEqual([]);
  });

  it("a comparação é a do app para nomes do Cadastro (sem acento nem caixa)", () => {
    expect(ids([processo("speciality - india", 3)], FORNECEDORES_FIXTURE)).toHaveLength(1);
  });

  it("fornecedor desativado no Cadastro, com prazo: o processo que já existe continua alertando", () => {
    expect(ids([processo("TESTE Antigo - Peru", 9)], [forn("TESTE Antigo", "Peru", 5, { ativo: false })])).toHaveLength(1);
  });

  it("lista carregada que NÃO tem o fornecedor do processo: sem alerta (o Cadastro manda)", () => {
    expect(ids([processo("Poros - Turquia", 30)], [forn("Beldimed", "Bélgica", 7)])).toEqual([]);
  });
});

describe("nenhum alerta NOVO: legados sem país, 'Nacional' e 'Outro'", () => {
  it.each(["Nacional", "nacional", " Nacional "])("'%s' nunca alerta, com ou sem Cadastro", (valor) => {
    const p = processo(valor, 90);
    expect(ids([p], FORNECEDORES_FIXTURE)).toEqual([]);
    expect(ids([p])).toEqual([]);
  });

  it("'Nacional' não alerta nem se alguém cadastrar um fornecedor com esse nome e um prazo", () => {
    expect(ids([processo("Nacional", 30)], [forn("Nacional", "", 1)])).toEqual([]);
    expect(prazoDoFornecedorNoCadastro("Nacional", [forn("Nacional", "", 1)])).toBeUndefined();
  });

  it.each(["Can Pharma", "Venecza", "Baiyue", "Tosun", "Medlin", "Upharm", "Outro", "Poros"])("legado/texto livre '%s' (sem o país): nenhum alerta", (valor) => {
    // Mesmo que o Cadastro tenha prazo para "<valor> - <país>", só o RÓTULO INTEIRO casa: nada de herdar prazo por aproximação de nome.
    const cadastro = [forn("Can Pharma", "China", 2), forn("Venecza", "Itália", 2), forn("Baiyue", "China", 2), forn("Tosun", "China", 2), forn("Medlin", "Índia", 2), forn("Poros", "Turquia", 3)];
    expect(ids([processo(valor, 60)], cadastro)).toEqual([]);
    expect(ids([processo(valor, 60)])).toEqual([]); // e a tabela antiga também não alertava
  });

  it("depois de convertido para 'Nome - País' (como o Cadastro tem), o prazo do Cadastro passa a valer", () => {
    expect(ids([processo("Can Pharma - China", 5)], [forn("Can Pharma", "China", 5)])).toHaveLength(1);
  });

  it("sem fornecedor no processo: nenhum alerta", () => {
    expect(ids([processo(undefined, 60)], FORNECEDORES_FIXTURE)).toEqual([]);
    expect(ids([processo("", 60)], FORNECEDORES_FIXTURE)).toEqual([]);
  });
});

describe("sem a lista do Cadastro: a tabela antiga é a RESERVA (o sino não cai)", () => {
  it.each([[undefined], [null], [[]]])("lista %j: Poros alerta com 3 dias, como sempre", (lista) => {
    const p = processo("Poros - Turquia", 3);
    expect(ids([p], lista as readonly FornecedorLido[] | null | undefined)).toEqual([p.id]);
  });

  it("a reserva também não alerta Can Pharma, Nacional nem Outro", () => {
    const ps = [processo("Can Pharma", 60), processo("Nacional", 60), processo("Outro", 60), processo("Upharm", 60)];
    expect(ids(ps, null)).toEqual([]);
  });

  it("fornecedoresParaAlerta: só confia na lista carregada e NÃO vazia", () => {
    expect(fornecedoresParaAlerta(false, FORNECEDORES_FIXTURE)).toBeNull();
    expect(fornecedoresParaAlerta(true, [])).toBeNull();
    expect(fornecedoresParaAlerta(false, [])).toBeNull();
    expect(fornecedoresParaAlerta(true, FORNECEDORES_FIXTURE)).toBe(FORNECEDORES_FIXTURE);
  });
});

describe("com o Cadastro, as outras regras do alerta continuam iguais", () => {
  it("status fora de 'Na origem', abertura de thread, alerta resolvido e embarque futuro continuam suprimindo", () => {
    const base = { fornecedor: "Poros - Turquia" };
    const ps = [
      processo("Poros - Turquia", 10, { status: "em_transito", ...base }),
      processo("Poros - Turquia", 10, { datas: { dataCompraPO: compraHa(10), aberturaThread: "05/09" } }),
      processo("Poros - Turquia", 10, { alertaFornecedorResolvido: true }),
      processo("Poros - Turquia", 10, { datas: { dataCompraPO: compraHa(10), dataEmbarque: "20/09/2026" } }),
    ];
    expect(ids(ps, FORNECEDORES_FIXTURE)).toEqual([]);
    expect(ids(ps)).toEqual([]);
  });

  it("ordena por mais atrasado primeiro", () => {
    const a = processo("Poros - Turquia", 4); // 1 dia de atraso
    const b = processo("Poros - Turquia", 9); // 6 dias
    const c = processo("Pharyx - China", 15); // 5 dias
    expect(ids([a, b, c], FORNECEDORES_FIXTURE)).toEqual([b.id, c.id, a.id]);
  });
});
