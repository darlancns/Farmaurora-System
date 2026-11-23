// Ícones do Follow-Up (card do Kanban e barra lateral do processo): traço fino, viewBox 24x24, só <path> (os círculos viram
// arcos). Cada chave é a lista de `d` do SVG; quem renderiza define tamanho, stroke-width e cor. Fonte única: o card do Kanban
// (ProcessoKanbanCard.vue) e o painel (ProcessoPainel.vue) usam estes desenhos.

export type ChaveIconeCard = "responsavel" | "consultor" | "pendencias" | "fornecedor" | "despachante" | "aereo";
export type ChaveIconePainel =
  | ChaveIconeCard
  | "envio"
  | "awb"
  | "transportadora"
  | "local"
  | "numeroProcesso"
  | "mover"
  | "editar"
  | "fechar"
  | "alerta"
  | "lixeira";
export type ChaveIcone = ChaveIconeCard | ChaveIconePainel;

// Os seis do card (mesmos desenhos de sempre): usuário com check, usuário, alerta, prédio, prancheta com check, avião.
export const ICONES_CARD: Record<ChaveIconeCard, string[]> = {
  responsavel: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z", "m16 11 2 2 4-4"],
  consultor: [
    "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
  ],
  pendencias: [
    "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
  ],
  fornecedor: [
    "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z",
    "M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2",
    "M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2",
    "M10 6h4M10 10h4M10 14h4M10 18h4",
  ],
  despachante: [
    "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z",
    "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
    "m9 14 2 2 4-4",
  ],
  aereo: [
    "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
  ],
};

// Os que só o painel usa (estilo lucide). Os círculos viraram arcos: caminhão (17,18,r2) e (7,18,r2); pino (12,10,r3).
const ICONES_SO_PAINEL: Record<Exclude<ChaveIconePainel, ChaveIconeCard>, string[]> = {
  envio: [
    "M16.5 9.4 7.5 4.21",
    "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
    "m3.3 7 8.7 5 8.7-5",
    "M12 22V12",
  ],
  awb: ["M3 5v14", "M8 5v14", "M12 5v14", "M17 5v14", "M21 5v14"],
  transportadora: [
    "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2",
    "M15 18H9",
    "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14",
    "M15 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
    "M5 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  ],
  local: ["M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z", "M9 10a3 3 0 1 0 6 0a3 3 0 1 0-6 0"],
  numeroProcesso: ["M4 9h16", "M4 15h16", "M10 3 8 21", "m16 3-2 18"],
  mover: ["m16 3 4 4-4 4", "M20 7H4", "m8 21-4-4 4-4", "M4 17h16"],
  editar: ["M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"],
  fechar: ["M18 6 6 18", "m6 6 12 12"],
  alerta: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
  lixeira: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
};

/** Todos os ícones (card + painel), por chave. */
export const ICONES_PROCESSO: Record<ChaveIconePainel, string[]> = { ...ICONES_CARD, ...ICONES_SO_PAINEL };

// Ícones de ESTADO dos controles do Entregue (card e painel): relógio = pendente, check em círculo = concluído (lucide: clock e
// circle-check; os círculos viram arcos). Registro SEPARADO: ChaveIconeCard continua com os seis do card.
export type ChaveIconeEstado = "pendente" | "concluido";
export const ICONES_ESTADO: Record<ChaveIconeEstado, string[]> = {
  pendente: ["M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0Z", "M12 6v6l4 2"],
  concluido: ["M21.801 10A10 10 0 1 1 17 3.335", "m9 11 3 3L22 4"],
};
