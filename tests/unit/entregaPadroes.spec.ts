import { describe, expect, it } from "vitest";
import {
  DIRS_POR_MODAL,
  dirsDoModal,
  isDirProtocolo,
  isPagamentoTransportadora,
  MODAL_AIR_CARGO,
  MODAL_COURIER_FORMAL,
  MODAL_COURIER_SIMPLES,
  ROTULOS_DIR_PROTOCOLO,
  DIRS_PROTOCOLO,
} from "../../shared/constants/processos";
import {
  controleDirDoModal,
  controlesAplicaveis,
  dirValidoParaModal,
  mapearDirParaModal,
  padroesAoEntregar,
  transportadoraDoPagamento,
} from "../../shared/utils/entregaPadroes";

// Regras puras dos controles do status Entregue (shared/utils/entregaPadroes.ts e as constantes de
// shared/constants/processos.ts): quem é a transportadora do pagamento, qual DIR o envio usa, os padrões ao entregar.

describe("transportadoraDoPagamento (AJC / Doctor, palavra inteira, sem caixa nem acento)", () => {
  it("os nomes exatos do banco", () => {
    expect(transportadoraDoPagamento("AJC")).toBe("AJC");
    expect(transportadoraDoPagamento("Doctor")).toBe("Doctor");
  });

  it("caixa, espaços e acento não importam", () => {
    for (const nome of ["ajc", "Ajc", "aJc", "  AJC  ", "\tAjc\n", "Ájc"]) {
      expect(transportadoraDoPagamento(nome), JSON.stringify(nome)).toBe("AJC");
    }
    for (const nome of ["doctor", "DOCTOR", " Doctor ", "DóCtor"]) {
      expect(transportadoraDoPagamento(nome), JSON.stringify(nome)).toBe("Doctor");
    }
  });

  it("palavra inteira: 'Ajc Transportes' e 'Doctor Transportes' valem; 'ajcx', 'doctors' e 'majc' não", () => {
    expect(transportadoraDoPagamento("Ajc Transportes")).toBe("AJC");
    expect(transportadoraDoPagamento("AJC - Transportes")).toBe("AJC");
    expect(transportadoraDoPagamento("Transportes Doctor Ltda")).toBe("Doctor");
    for (const nome of ["ajcx", "doctors", "majc", "ajc2", "Docto"]) {
      expect(transportadoraDoPagamento(nome), nome).toBeNull();
    }
  });

  it("outra transportadora, vazio, só espaços, ausente e não texto: null", () => {
    for (const nome of ["Braspress", "", "   ", null, undefined, 5 as unknown as string]) {
      expect(transportadoraDoPagamento(nome), String(nome)).toBeNull();
    }
  });

  it("o nome que cita as duas (ambíguo) não é nenhuma", () => {
    expect(transportadoraDoPagamento("AJC / Doctor")).toBeNull();
  });
});

describe("controleDirDoModal e dirValidoParaModal (comparação EXATA do envio)", () => {
  it("só Courier Simples e Courier Formal têm DIR", () => {
    expect(controleDirDoModal(MODAL_COURIER_SIMPLES)).toBe("simples");
    expect(controleDirDoModal(MODAL_COURIER_FORMAL)).toBe("formal");
    for (const modal of [MODAL_AIR_CARGO, "Courier", "courier simples", " Courier Simples", "", null, undefined]) {
      expect(controleDirDoModal(modal), String(modal)).toBeNull();
    }
  });

  it("as opções por envio: Simples = 3 com protocolo; Formal = só pegar_dir e dir_no_drive", () => {
    expect(dirsDoModal(MODAL_COURIER_SIMPLES)).toEqual(["pegar_dir_protocolo", "dir_no_drive", "dir_protocolo"]);
    expect(dirsDoModal(MODAL_COURIER_FORMAL)).toEqual(["pegar_dir", "dir_no_drive"]);
    expect(dirsDoModal(MODAL_AIR_CARGO)).toEqual([]);
    expect(dirsDoModal("Courier")).toEqual([]);
    expect(dirsDoModal(undefined)).toEqual([]);
    expect(Object.keys(DIRS_POR_MODAL)).toEqual([MODAL_COURIER_SIMPLES, MODAL_COURIER_FORMAL]);
  });

  it("Formal rejeita pegar_dir_protocolo e dir_protocolo; Simples rejeita pegar_dir; sem Courier nada vale", () => {
    expect(dirValidoParaModal(MODAL_COURIER_FORMAL, "pegar_dir")).toBe(true);
    expect(dirValidoParaModal(MODAL_COURIER_FORMAL, "dir_no_drive")).toBe(true);
    expect(dirValidoParaModal(MODAL_COURIER_FORMAL, "pegar_dir_protocolo")).toBe(false);
    expect(dirValidoParaModal(MODAL_COURIER_FORMAL, "dir_protocolo")).toBe(false);

    expect(dirValidoParaModal(MODAL_COURIER_SIMPLES, "pegar_dir_protocolo")).toBe(true);
    expect(dirValidoParaModal(MODAL_COURIER_SIMPLES, "dir_no_drive")).toBe(true);
    expect(dirValidoParaModal(MODAL_COURIER_SIMPLES, "dir_protocolo")).toBe(true);
    expect(dirValidoParaModal(MODAL_COURIER_SIMPLES, "pegar_dir")).toBe(false);

    for (const dir of DIRS_PROTOCOLO) expect(dirValidoParaModal(MODAL_AIR_CARGO, dir), dir).toBe(false);
    expect(dirValidoParaModal(MODAL_COURIER_SIMPLES, "qualquer")).toBe(false);
    expect(dirValidoParaModal(MODAL_COURIER_SIMPLES, null)).toBe(false);
  });

  it("valores e rótulos: os 4 do banco, cada um com rótulo; os do pagamento são pendente e pago", () => {
    expect(Object.keys(ROTULOS_DIR_PROTOCOLO).sort()).toEqual([...DIRS_PROTOCOLO].sort());
    expect(DIRS_PROTOCOLO.every(isDirProtocolo)).toBe(true);
    expect(isDirProtocolo("pegar")).toBe(false);
    expect(isPagamentoTransportadora("pendente")).toBe(true);
    expect(isPagamentoTransportadora("pago")).toBe(true);
    expect(isPagamentoTransportadora("Pago")).toBe(false);
    expect(isPagamentoTransportadora(null)).toBe(false);
  });
});

describe("mapearDirParaModal (trocar Courier Simples <-> Formal mantém pendente/concluído)", () => {
  it("Simples -> Formal: pegar_dir_protocolo -> pegar_dir; dir_protocolo -> dir_no_drive; dir_no_drive igual", () => {
    expect(mapearDirParaModal("pegar_dir_protocolo", MODAL_COURIER_FORMAL)).toBe("pegar_dir");
    expect(mapearDirParaModal("dir_protocolo", MODAL_COURIER_FORMAL)).toBe("dir_no_drive");
    expect(mapearDirParaModal("dir_no_drive", MODAL_COURIER_FORMAL)).toBe("dir_no_drive");
  });

  it("Formal -> Simples: pegar_dir -> pegar_dir_protocolo; dir_no_drive igual", () => {
    expect(mapearDirParaModal("pegar_dir", MODAL_COURIER_SIMPLES)).toBe("pegar_dir_protocolo");
    expect(mapearDirParaModal("dir_no_drive", MODAL_COURIER_SIMPLES)).toBe("dir_no_drive");
  });

  it("valor que já vale para o novo envio fica como está", () => {
    expect(mapearDirParaModal("pegar_dir", MODAL_COURIER_FORMAL)).toBe("pegar_dir");
    expect(mapearDirParaModal("dir_protocolo", MODAL_COURIER_SIMPLES)).toBe("dir_protocolo");
  });

  it("vazio continua vazio; envio sem DIR mantém o valor (oculto, nada se apaga)", () => {
    expect(mapearDirParaModal(null, MODAL_COURIER_FORMAL)).toBeNull();
    expect(mapearDirParaModal(undefined, MODAL_COURIER_SIMPLES)).toBeNull();
    expect(mapearDirParaModal("dir_protocolo", MODAL_AIR_CARGO)).toBe("dir_protocolo");
    expect(mapearDirParaModal("pegar_dir", "")).toBe("pegar_dir");
  });

  it("o resultado sempre vale para o novo envio Courier", () => {
    for (const dir of DIRS_PROTOCOLO) {
      for (const modal of [MODAL_COURIER_SIMPLES, MODAL_COURIER_FORMAL]) {
        expect(dirValidoParaModal(modal, mapearDirParaModal(dir, modal)), `${dir} -> ${modal}`).toBe(true);
      }
    }
  });
});

describe("controlesAplicaveis", () => {
  it("Courier Formal com AJC: os dois controles", () => {
    expect(controlesAplicaveis({ modalEnvio: MODAL_COURIER_FORMAL, transportadoraNacional: { nome: "AJC" } })).toEqual({
      pagamentoTransportadora: "AJC",
      dir: "formal",
    });
  });

  it("Air Cargo com Doctor: só o pagamento", () => {
    expect(controlesAplicaveis({ modalEnvio: MODAL_AIR_CARGO, transportadoraNacional: { nome: "Doctor" } })).toEqual({
      pagamentoTransportadora: "Doctor",
      dir: null,
    });
  });

  it("Courier Simples esconde a transportadora: o nome gravado NÃO ativa o pagamento; o DIR sim", () => {
    expect(controlesAplicaveis({ modalEnvio: MODAL_COURIER_SIMPLES, transportadoraNacional: { nome: "AJC" } })).toEqual({
      pagamentoTransportadora: null,
      dir: "simples",
    });
  });

  it("sem envio e sem transportadora: nenhum; outra transportadora: sem pagamento; envio legado 'Courier': sem DIR", () => {
    expect(controlesAplicaveis({})).toEqual({ pagamentoTransportadora: null, dir: null });
    expect(controlesAplicaveis({ modalEnvio: MODAL_AIR_CARGO, transportadoraNacional: { nome: "Braspress" } })).toEqual({
      pagamentoTransportadora: null,
      dir: null,
    });
    expect(controlesAplicaveis({ modalEnvio: "Courier", transportadoraNacional: { nome: "AJC" } })).toEqual({
      pagamentoTransportadora: "AJC",
      dir: null,
    });
  });
});

describe("padroesAoEntregar (só campo vazio)", () => {
  it("Courier Formal com AJC: pagamento pendente e pegar_dir", () => {
    expect(padroesAoEntregar({ modalEnvio: MODAL_COURIER_FORMAL, transportadoraNacional: { nome: "AJC" } })).toEqual({
      pagamentoTransportadora: "pendente",
      dirProtocolo: "pegar_dir",
    });
  });

  it("Courier Simples: só pegar_dir_protocolo (a transportadora fica oculta)", () => {
    expect(padroesAoEntregar({ modalEnvio: MODAL_COURIER_SIMPLES, transportadoraNacional: { nome: "Doctor" } })).toEqual({
      dirProtocolo: "pegar_dir_protocolo",
    });
  });

  it("Air Cargo com Doctor: só o pagamento pendente", () => {
    expect(padroesAoEntregar({ modalEnvio: MODAL_AIR_CARGO, transportadoraNacional: { nome: "Doctor" } })).toEqual({
      pagamentoTransportadora: "pendente",
    });
  });

  it("sem envio, sem transportadora ou com outra transportadora: nada a preencher", () => {
    expect(padroesAoEntregar({})).toEqual({});
    expect(padroesAoEntregar({ modalEnvio: MODAL_AIR_CARGO, transportadoraNacional: { nome: "Braspress" } })).toEqual({});
  });

  it("valor já preenchido nunca é trocado (nem o 'pago', nem um DIR concluído)", () => {
    expect(
      padroesAoEntregar({
        modalEnvio: MODAL_COURIER_FORMAL,
        transportadoraNacional: { nome: "AJC" },
        pagamentoTransportadora: "pago",
        dirProtocolo: "dir_no_drive",
      }),
    ).toEqual({});
    expect(
      padroesAoEntregar({
        modalEnvio: MODAL_COURIER_FORMAL,
        transportadoraNacional: { nome: "AJC" },
        pagamentoTransportadora: "pago",
      }),
    ).toEqual({ dirProtocolo: "pegar_dir" });
  });
});
