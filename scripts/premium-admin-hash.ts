/**
 * Gera o hash da senha do admin da loja Premium (variável PREMIUM_ADMIN_PASSWORD_HASH).
 *
 *   npm run premium:hash
 *
 * Lê a senha da entrada padrão: digitada sem eco no terminal, ou canalizada
 * (`printf '%s' "$SENHA" | npm run premium:hash --silent`). NUNCA por argumento de linha de
 * comando (apareceria no histórico do shell e na lista de processos). Imprime só o hash.
 */
import { stdin, stderr, stdout } from 'node:process';

// hashPassword não usa o segredo; o módulo apenas exige que a variável exista ao carregar.
process.env.JWT_SECRET ||= 'premium-hash-script';

function lerSemEco(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    stderr.write(prompt);
    let senha = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const fim = () => { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); stderr.write('\n'); };
    const onData = (chunk: string) => {
      for (const c of chunk) {
        if (c === '\u0003') { fim(); reject(new Error('Cancelado')); return; } // Ctrl+C
        if (c === '\r' || c === '\n' || c === '\u0004') { fim(); resolve(senha); return; }
        if (c === '\u007f' || c === '\b') senha = senha.slice(0, -1);
        else senha += c;
      }
    };
    stdin.on('data', onData);
  });
}

async function lerCanalizada(): Promise<string> {
  let dados = '';
  stdin.setEncoding('utf8');
  for await (const chunk of stdin) dados += chunk;
  return dados.replace(/\r?\n$/, '');
}

async function main() {
  let senha: string;
  if (stdin.isTTY) {
    senha = await lerSemEco('Senha do admin da loja (sem eco): ');
    const confirmacao = await lerSemEco('Repita a senha: ');
    if (senha !== confirmacao) throw new Error('As senhas não conferem.');
  } else {
    senha = await lerCanalizada();
  }
  if (senha.length < 10) throw new Error('Use uma senha com pelo menos 10 caracteres.');
  const { hashPassword } = await import('../server/auth');
  stdout.write(hashPassword(senha) + '\n');
}

main().catch((e: unknown) => {
  stderr.write(`Erro: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
