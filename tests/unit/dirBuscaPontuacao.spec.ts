import { describe, expect, it } from "vitest";
import {
  FILTROS_DIR_VAZIOS,
  aplicarFiltrosDir,
  criarTermoBuscaDir,
  dirCombinaBusca,
} from "../../app/utils/dirFiltros";
import { normalizarOrdem } from "../../app/utils/processoBusca";
import { normalizarSemPontuacao, normalizeText } from "../../app/utils/search";
import { novoDir } from "./helpers/dirFixtures";

// Busca da DIR ignorando pontuação em PO e AWB (a mesma regra do Nº Ordem do Follow-Up: só letras e números).
// Paciente e medicamento seguem só sem caixa e sem acento. Dados inventados.

const A = novoDir({
  id: "a",
  po: "PO26-10-0471",
  paciente: "João Ávila",
  medicamento: "KEYTRUDA 100mg/ml",
  awb: "Lufthansa: 020-46388355",
});
const B = novoDir({
  id: "b",
  po: "PO26-10-0472",
  paciente: "MARIA SOUZA",
  medicamento: "ENHERTU",
  awb: "Emirates: 176-22222222",
});
const C = novoDir({ id: "c", po: "PO26-11-0001", paciente: "Ana Lima", medicamento: "OPDIVO", awb: "" });
const LISTA = [A, B, C];

const achar = (busca: string): string[] => aplicarFiltrosDir(LISTA, { ...FILTROS_DIR_VAZIOS, busca }).map((d) => d.id);

// A regra ANTIGA (só normalizeText sobre "paciente po medicamento awb"), para comparar.
const achouNoAntigo = (busca: string): string[] => {
  const termo = normalizeText(busca);
  if (!termo) return LISTA.map((d) => d.id);
  return LISTA.filter((d) => normalizeText([d.paciente, d.po, d.medicamento, d.awb].join(" ")).includes(termo)).map(
    (d) => d.id,
  );
};

describe("busca da DIR — PO sem pontuação", () => {
  it.each([
    ["po26100471", ["a"]],
    ["PO26100471", ["a"]],
    ["26100471", ["a"]],
    ["26-10-0471", ["a"]],
    ["26 10 0471", ["a"]],
    ["po-26-10-0471", ["a"]],
    ["PO26-10-0471", ["a"]],
    ["Po26", ["a", "b", "c"]],
    ["po2610", ["a", "b"]],
    ["po261004", ["a", "b"]],
    ["po261100", ["c"]],
  ])("'%s' acha %j", (busca, esperado) => {
    expect(achar(busca)).toEqual(esperado);
  });

  it("não acha PO que não existe", () => {
    expect(achar("po26100999")).toEqual([]);
    expect(achar("po27")).toEqual([]);
  });
});

describe("busca da DIR — AWB sem pontuação", () => {
  it.each([
    ["02046388355", ["a"]],
    ["020-46388355", ["a"]],
    ["020 46388355", ["a"]],
    ["Lufthansa: 020-46388355", ["a"]],
    ["lufthansa02046388355", ["a"]],
    ["176 22222222", ["b"]],
    ["emirates17622222222", ["b"]],
  ])("'%s' acha %j", (busca, esperado) => {
    expect(achar(busca)).toEqual(esperado);
  });
});

describe("busca da DIR — acento, caixa e campos", () => {
  it.each([
    ["joao", ["a"]],
    ["JOAO AVILA", ["a"]],
    ["João", ["a"]],
    ["ávila", ["a"]],
    ["maria souza", ["b"]],
    ["keytruda", ["a"]],
    ["KEYTRUDA 100mg/ml", ["a"]],
    ["enhertu", ["b"]],
  ])("'%s' acha %j", (busca, esperado) => {
    expect(achar(busca)).toEqual(esperado);
  });

  it("paciente e medicamento NÃO ignoram pontuação (como o paciente no Follow-Up)", () => {
    expect(achar("100mgml")).toEqual([]); // o medicamento é "KEYTRUDA 100mg/ml"
    expect(achar("mariasouza")).toEqual([]);
  });

  it("os campos pesquisados continuam os mesmos: nada de vendedor, fornecedor, banco...", () => {
    const so = novoDir({ id: "x", paciente: "ZZ", po: "PO26-01-0001", medicamento: "ZZ", awb: "", vendedor: "Vinícius", fornecedor: "Poros", banco: "XP" });
    for (const busca of ["vinicius", "poros", "xp"]) {
      expect(aplicarFiltrosDir([so], { ...FILTROS_DIR_VAZIOS, busca }), busca).toHaveLength(0);
    }
  });

  it("sem busca (vazia ou só espaços) devolve a lista toda", () => {
    expect(achar("")).toEqual(["a", "b", "c"]);
    expect(achar("   ")).toEqual(["a", "b", "c"]);
  });
});

describe("busca da DIR — consultas curtas e só pontuação", () => {
  it("só espaços: sem busca; só pontuação: termo existe, mas sem 'código' (nunca casa com tudo por ser vazio)", () => {
    expect(criarTermoBuscaDir("   ")).toBeNull();
    expect(criarTermoBuscaDir("--")).toEqual({ texto: "--", codigo: "" });
    expect(criarTermoBuscaDir("Po-26 ")).toEqual({ texto: "po-26", codigo: "po26" });
  });

  it("só pontuação que não existe em nenhum campo: nenhum resultado (e não a lista toda)", () => {
    expect(achar("§")).toEqual([]);
    expect(achar("...")).toEqual([]);
    expect(achar("//")).toEqual([]);
  });

  it("só pontuação que existe no texto casa como sempre ('-' está nos PO e AWB)", () => {
    expect(achar("-")).toEqual(achouNoAntigo("-"));
  });

  it("consulta curta (1 a 3 caracteres): casa com tudo que contém essas letras/números em PO ou AWB, como no Follow-Up", () => {
    expect(achar("1")).toEqual(["a", "b", "c"]); // todo PO tem o dígito 1
    expect(achar("61")).toEqual(["a", "b", "c"]); // "po2610..." / "po2611..." (o hífen entre 6 e 1 é ignorado)
    expect(achar("04")).toEqual(["a", "b"]); // "0471" e "0472"; o 3º é "0001"
    expect(achar("zz")).toEqual([]);
  });

  it("nunca devolve MENOS do que a regra antiga: só acrescenta PO/AWB achados sem a pontuação", () => {
    const termos = ["", " ", "po26", "26-10", "joao", "keytruda", "100mg", "lufthansa", "020", "-", "a", "1", "po-26", "x y"];
    for (const termo of termos) {
      const antigo = achouNoAntigo(termo);
      const novo = achar(termo);
      for (const id of antigo) expect(novo, `termo "${termo}"`).toContain(id);
    }
  });

  it("o que a nova regra ACRESCENTA vem sempre de PO ou AWB", () => {
    for (const termo of ["po26100471", "02046388355", "po2610", "176 22222222", "4638"]) {
      const extras = achar(termo).filter((id) => !achouNoAntigo(termo).includes(id));
      for (const id of extras) {
        const d = LISTA.find((x) => x.id === id)!;
        const codigo = normalizarSemPontuacao(termo);
        expect(
          normalizarSemPontuacao(d.po).includes(codigo) || normalizarSemPontuacao(d.awb).includes(codigo),
          `${termo} → ${id}`,
        ).toBe(true);
      }
    }
  });

  it("dirCombinaBusca usa o termo preparado uma vez", () => {
    const termo = criarTermoBuscaDir("po26100471")!;
    expect(dirCombinaBusca(A, termo)).toBe(true);
    expect(dirCombinaBusca(B, termo)).toBe(false);
  });
});

describe("a mesma normalização do Follow-Up", () => {
  it("normalizarOrdem (Nº Ordem do Follow-Up) é a normalizarSemPontuacao compartilhada", () => {
    for (const v of ["PO-25-2652/3", " po 25-11 ", "---", "ação/é", "Lufthansa: 020-46388355", "PO26-10-0471", ""]) {
      expect(normalizarOrdem(v), v).toBe(normalizarSemPontuacao(v));
    }
  });

  it("só letras e números, sem acento nem caixa", () => {
    expect(normalizarSemPontuacao("PO-25-0123/XYZ")).toBe("po250123xyz");
    expect(normalizarSemPontuacao("ação/é")).toBe("acaoe");
    expect(normalizarSemPontuacao("---")).toBe("");
  });
});
