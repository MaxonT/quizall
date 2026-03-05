export function shouldInjectError() { return false; }
export async function injectDelay() {}
export class InjectedError extends Error {
  constructor(msg, code) { super(msg); this.code = code; }
}
