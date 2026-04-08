import { readFileSync } from "fs";
import {
  Index,
  SymbolRole,
  ExtractedSymbol,
  ParseResult,
} from "./types.js";

export function parseIndex(scipPath: string): ParseResult {
  const raw = readFileSync(scipPath, "utf-8");
  const index: Index = JSON.parse(raw);

  const symbols: ExtractedSymbol[] = [];

  for (const doc of index.documents) {
    for (const sym of doc.symbols) {
      const definitionOcc = doc.occurrences.find(
        (o) => o.symbol === sym.symbol && (o.symbolRoles & SymbolRole.Definition) !== 0
      );

      symbols.push({
        symbol: sym.symbol,
        kind: sym.kind,
        displayName: sym.displayName,
        filePath: doc.relativePath,
        position: definitionOcc ? definitionOcc.range.start : { line: 0, character: 0 },
      });
    }
  }

  return { index, symbols };
}

export function getDefinitions(index: Index): ExtractedSymbol[] {
  const result: ExtractedSymbol[] = [];
  for (const doc of index.documents) {
    for (const sym of doc.symbols) {
      const definitionOcc = doc.occurrences.find(
        (o) => o.symbol === sym.symbol && (o.symbolRoles & SymbolRole.Definition) !== 0
      );
      result.push({
        symbol: sym.symbol,
        kind: sym.kind,
        displayName: sym.displayName,
        filePath: doc.relativePath,
        position: definitionOcc ? definitionOcc.range.start : { line: 0, character: 0 },
      });
    }
  }
  return result;
}
