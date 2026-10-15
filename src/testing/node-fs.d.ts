// The one Node API the specs use (vitest runs them in Node): the project has no @types/node.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
