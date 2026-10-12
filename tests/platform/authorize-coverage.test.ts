import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { GET as auditGet } from "@/app/api/audit/route";
import { apiRequest, routeCtx, users } from "../helpers";

const ROOT = join(__dirname, "..", "..");

// Entry points that intentionally run before or outside authorization.
const ALLOWLIST = new Set([
  "src/app/api/health/route.ts", // liveness probe, no data
  "src/app/login/actions.ts", // sign-in / sign-out
]);
const ALLOWLIST_PREFIXES = ["src/app/api/mock-payments/"]; // simulated external provider, not part of the platform

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(join(ROOT, "src")).map((f) => relative(ROOT, f).split("\\").join("/"));
const isService = (f: string) => /(^|\/|-)service\.ts$/.test(f);
const isEntryPoint = (f: string) => /\/route\.ts$/.test(f) || /\/actions\.ts$/.test(f);

type ExportedFn = { name: string; body: ts.Node };

function exportedFunctions(source: ts.SourceFile): ExportedFn[] {
  const out: ExportedFn[] = [];
  const exported = (n: ts.Node) =>
    ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const stmt of source.statements) {
    if (ts.isFunctionDeclaration(stmt) && exported(stmt) && stmt.body && stmt.name) {
      out.push({ name: stmt.name.text, body: stmt.body });
    }
    if (ts.isVariableStatement(stmt) && exported(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (d.initializer && ts.isIdentifier(d.name) && containsFunction(d.initializer)) {
          out.push({ name: d.name.text, body: d.initializer });
        }
      }
    }
  }
  return out;
}

function containsFunction(node: ts.Node): boolean {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return true;
  return ts.forEachChild(node, (c) => (containsFunction(c) ? true : undefined)) ?? false;
}

function calledNames(node: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (ts.isIdentifier(callee)) names.add(callee.text);
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) names.add(callee.expression.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return names;
}

function serviceImports(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const stmt of source.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (!/(\/|-)service$/.test(stmt.moduleSpecifier.text)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) bindings.elements.forEach((e) => names.add(e.name.text));
    if (bindings && ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
  }
  return names;
}

function parse(file: string) {
  return ts.createSourceFile(file, readFileSync(join(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true);
}

describe("authorization coverage", () => {
  it("INV-8: every exported service function calls authorize()", () => {
    const services = files.filter(isService);
    expect(services.length).toBeGreaterThan(0);
    const missing = services.flatMap((f) =>
      exportedFunctions(parse(f))
        .filter((fn) => !calledNames(fn.body).has("authorize"))
        .map((fn) => `${f}#${fn.name}`),
    );
    expect(missing).toEqual([]);
  });

  it("INV-8: every route handler and server action calls authorize() or an authorizing service function", () => {
    const entryPoints = files
      .filter(isEntryPoint)
      .filter((f) => !ALLOWLIST.has(f) && !ALLOWLIST_PREFIXES.some((p) => f.startsWith(p)));
    expect(entryPoints.length).toBeGreaterThan(0);
    const missing = entryPoints.flatMap((f) => {
      const source = parse(f);
      const services = serviceImports(source);
      return exportedFunctions(source)
        .filter((fn) => {
          const called = calledNames(fn.body);
          return !called.has("authorize") && ![...called].some((n) => services.has(n));
        })
        .map((fn) => `${f}#${fn.name}`);
    });
    expect(missing).toEqual([]);
  });

  it("INV-8: GET /api/audit returns 403 for a requester", async () => {
    const res = await auditGet(await apiRequest("/api/audit", { asUser: users.requester.id }), routeCtx({}));
    expect(res.status).toBe(403);
  });

  it("INV-8: GET /api/audit returns 401 without a session", async () => {
    const res = await auditGet(await apiRequest("/api/audit"), routeCtx({}));
    expect(res.status).toBe(401);
  });

  it("GET /api/audit returns 200 for an auditor", async () => {
    const res = await auditGet(await apiRequest("/api/audit", { asUser: users.auditor.id }), routeCtx({}));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number };
    expect(typeof body.total).toBe("number");
  });
});
