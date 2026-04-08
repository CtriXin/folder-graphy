// SCIP (Sourcegraph Code Intelligence Protocol) Type Definitions - Simplified

export enum SymbolRole {
  UnspecifiedSymbolRole = 0,
  Definition = 1,
  Import = 2,
  WriteAccess = 4,
  ReadAccess = 8,
}

export enum SymbolKind {
  UnspecifiedSymbolKind = 0,
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
}

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Relationship {
  symbol: string;
  isReference: boolean;
  isImplementation: boolean;
  isTypeDefinition: boolean;
}

export interface SymbolInformation {
  symbol: string;
  documentation: string[];
  relationships: Relationship[];
  kind: SymbolKind;
  displayName: string;
}

export interface Occurrence {
  range: Range;
  symbol: string;
  symbolRoles: SymbolRole;
}

export interface Document {
  language: string;
  relativePath: string;
  occurrences: Occurrence[];
  symbols: SymbolInformation[];
}

export interface Metadata {
  version: number;
  projectRoot: string;
}

export interface Index {
  metadata?: Metadata;
  documents: Document[];
  externalSymbols: SymbolInformation[];
}

export interface ExtractedSymbol {
  symbol: string;
  kind: SymbolKind;
  displayName: string;
  filePath: string;
  position: Position;
}

export interface ParseResult {
  index: Index;
  symbols: ExtractedSymbol[];
}
