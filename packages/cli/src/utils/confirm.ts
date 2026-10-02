import * as readline from 'node:readline';

/**
 * Prompt user for y/N confirmation via stdin. Returns true if confirmed.
 * EOF (Ctrl-D, or an empty piped stdin) closes readline without answering the
 * question; that resolves false rather than leaving the prompt hanging.
 */
export function askConfirmation(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    // A promise settles once: after an answer, the close below is a no-op here.
    rl.on('close', () => resolve(false));
    rl.question(prompt, (answer) => {
      // Resolve before close(): close() emits 'close' synchronously.
      resolve(answer.trim().toLowerCase() === 'y');
      rl.close();
    });
  });
}
