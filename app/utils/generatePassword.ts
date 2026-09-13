// Alfabeto sem caracteres ambíguos (0/O, 1/l/I) para senha ditada/copiada.
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Gera uma senha aleatória legível (default 16 chars) usando a CSPRNG do
 * browser. O valor é exibido/editável antes de salvar — não é secreto no
 * sentido de precisar de hashing aqui.
 */
export function generatePassword(length = 16): string {
  const out: string[] = [];
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    out.push(ALPHABET[bytes[i]! % ALPHABET.length]!);
  }
  return out.join("");
}
