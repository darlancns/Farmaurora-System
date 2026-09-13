import type { ConsultorNome } from "../types/Patient";

/**
 * Lista canônica dos 7 consultores. Fonte única — importada tanto pelo server
 * (validação em server/utils/patientValidation.ts e nos endpoints admin) quanto
 * pelo client (select de "Nome do Consultor" na página de Configurações).
 *
 * Não redefinir esta lista em outro lugar.
 */
export const CONSULTORES: ConsultorNome[] = [
  "André Vitório",
  "Gabriela Megda",
  "Gabriela Santana",
  "Mateus Morais",
  "Paulo Braga",
  "Thiago Guedes",
  "Vinícius Alves",
];

/**
 * Trava de consistência (build-time): `satisfies Record<ConsultorNome, 0>` obriga
 * este objeto a ter UMA chave por membro de `ConsultorNome` — nem a mais, nem a
 * menos. Se o tipo ganhar/perder/renomear um nome sem esta lista ser atualizada
 * junto, o `vue-tsc` quebra aqui. Re-listar os nomes é proposital: é o que torna
 * a divergência um erro de build. Complementada pelo teste de runtime
 * tests/unit/consultores.spec.ts, que casa isto com o array `CONSULTORES` acima.
 */
({
  "André Vitório": 0,
  "Gabriela Megda": 0,
  "Gabriela Santana": 0,
  "Mateus Morais": 0,
  "Paulo Braga": 0,
  "Thiago Guedes": 0,
  "Vinícius Alves": 0,
}) satisfies Record<ConsultorNome, 0>;
