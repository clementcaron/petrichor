import ts from "typescript";

export function skeletonizeSource(source: string, fileName: string): string {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true);
  const ranges: Array<{ start: number; end: number }> = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node)) &&
      node.body &&
      ts.isBlock(node.body)
    ) {
      ranges.push({ start: node.body.getStart(sourceFile), end: node.body.getEnd() });
      // Don't recurse into the body — we're replacing it entirely.
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Apply replacements from end to start so earlier offsets stay valid.
  ranges.sort((a, b) => b.start - a.start);

  let result = source;
  for (const range of ranges) {
    result = result.slice(0, range.start) + "{}" + result.slice(range.end);
  }

  return result;
}
