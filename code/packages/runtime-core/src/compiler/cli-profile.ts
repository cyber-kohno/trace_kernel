import { typescript as ts } from "./typescript-util";

/** Only the Web APIs installed by the standalone V8 host. No Worker globals. */
export const cliWebDeclarations = `
declare class URL {
  constructor(input: string | URL, base?: string | URL);
  hash: string; host: string; hostname: string; href: string; password: string;
  pathname: string; port: string; protocol: string; search: string; username: string;
  readonly origin: string; readonly searchParams: URLSearchParams;
  toString(): string; toJSON(): string;
}
declare class URLSearchParams implements Iterable<[string, string]> {
  constructor(init?: string | string[][] | Record<string, string> | URLSearchParams);
  append(name: string, value: string): void; delete(name: string, value?: string): void;
  get(name: string): string | null; getAll(name: string): string[];
  has(name: string, value?: string): boolean; set(name: string, value: string): void;
  sort(): void; toString(): string;
  entries(): IterableIterator<[string, string]>; keys(): IterableIterator<string>;
  values(): IterableIterator<string>; [Symbol.iterator](): IterableIterator<[string, string]>;
  forEach(callback: (value: string, key: string, parent: URLSearchParams) => void): void;
}
type BufferSource = ArrayBuffer | ArrayBufferView;
declare class TextEncoder {
  readonly encoding: string;
  encode(input?: string): Uint8Array;
  encodeInto(input: string, destination: Uint8Array): {read: number; written: number};
}
declare class TextDecoder {
  constructor(label?: string, options?: {fatal?: boolean; ignoreBOM?: boolean});
  readonly encoding: string; readonly fatal: boolean; readonly ignoreBOM: boolean;
  decode(input?: BufferSource, options?: {stream?: boolean}): string;
}
declare class DOMException extends Error { constructor(message?: string, name?: string); readonly code: number; }
declare function atob(input: string): string;
declare function btoa(input: string): string;
declare function structuredClone<T>(value: T, options?: {transfer?: ArrayBuffer[]}): T;
declare function queueMicrotask(callback: () => void): void;
declare function setTimeout(callback: (...args: any[]) => void, delay?: number, ...args: any[]): number;
declare function setInterval(callback: (...args: any[]) => void, delay?: number, ...args: any[]): number;
declare function clearTimeout(id?: number): void;
declare function clearInterval(id?: number): void;
`;

/** Symbol resolution avoids rejecting comments, property names and local shadows. */
export const referencedLogics = (source: string, names: readonly string[]) => {
  const file = ts.createSourceFile(
    "user.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const globals = ts.createSourceFile(
    "globals.d.ts",
    "declare const $logic: any;",
    ts.ScriptTarget.Latest,
    true,
  );
  const files = new Map([
    [file.fileName, file],
    [globals.fileName, globals],
  ]);
  const host: ts.CompilerHost = {
    getSourceFile: (name) => files.get(name),
    getDefaultLibFileName: () => "",
    writeFile: () => {},
    getCurrentDirectory: () => "",
    getDirectories: () => [],
    fileExists: (name) => files.has(name),
    readFile: (name) => files.get(name)?.text,
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
  };
  const checker = ts
    .createProgram([...files.keys()], { noLib: true, noResolve: true }, host)
    .getTypeChecker();
  const used = new Set<string>();
  const visit = (node: ts.Node) => {
    const symbol =
      ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent)
        ? checker.getShorthandAssignmentValueSymbol(node.parent)
        : checker.getSymbolAtLocation(node);
    if (
      ts.isIdentifier(node) &&
      node.text === "$logic" &&
      symbol?.declarations?.some((d) => d.getSourceFile() === globals)
    ) {
      const parent = node.parent;
      let literal =
        ts.isPropertyAccessExpression(parent) && parent.expression === node
          ? parent.name.text
          : ts.isElementAccessExpression(parent) &&
              parent.expression === node &&
              parent.argumentExpression &&
              ts.isStringLiteralLike(parent.argumentExpression)
            ? parent.argumentExpression.text
            : null;
      if (
        literal == null &&
        ts.isElementAccessExpression(parent) &&
        parent.expression === node &&
        parent.argumentExpression
      ) {
        const type = checker.getTypeAtLocation(parent.argumentExpression);
        if (type.isStringLiteral()) literal = type.value;
      }
      if (literal == null) names.forEach((name) => used.add(name));
      else if (names.includes(literal)) used.add(literal);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return [...used];
};

export const logicAsWork = (source: string) => {
  const file = ts.createSourceFile(
    "logic.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const parts: string[] = [];
  for (const node of file.statements) {
    if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node))
      parts.push(node.getText(file).replace(/^export\s+/, ""));
    else if (ts.isFunctionDeclaration(node)) {
      parts.push(
        `const __cli_logic = ${node.getText(file).replace(/^export\s+default\s+/, "")}; void __cli_logic;`,
      );
    } else if (ts.isExportAssignment(node))
      parts.push(
        `const __cli_logic = ${node.expression.getText(file)}; void __cli_logic;`,
      );
    else parts.push(node.getText(file));
  }
  return parts.join("\n");
};
