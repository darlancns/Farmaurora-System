// Trava dos scripts de integração (smoke-*.mjs e pagamentos-store-real.spec.ts): eles acessam o
// Supabase REAL do .env (produção) e escrevem/apagam dados. Só rodam com ALLOW_REAL_DB=1, e a
// checagem acontece antes de qualquer conexão. Sem a variável, saem com mensagem clara.

function mensagemAllowRealDb(nome) {
  return (
    `${nome}: ALLOW_REAL_DB=1 não está definido. Este script acessa o Supabase REAL do .env ` +
    "(produção) e escreve/apaga dados. Para testar sem tocar na produção use o harness local " +
    "(Supabase falso). Só defina ALLOW_REAL_DB=1 se for exatamente isso que você quer."
  );
}

// Para o vitest de integração: lança (o suite falha com a mensagem, sem nenhuma conexão).
export function exigirAllowRealDb(nome) {
  if (process.env.ALLOW_REAL_DB !== "1") throw new Error(mensagemAllowRealDb(nome));
}

// Para os scripts node (.mjs): imprime a mensagem e sai com código 1.
export function exigirAllowRealDbOuSair(nome) {
  if (process.env.ALLOW_REAL_DB === "1") return;
  console.error(mensagemAllowRealDb(nome));
  process.exit(1);
}
