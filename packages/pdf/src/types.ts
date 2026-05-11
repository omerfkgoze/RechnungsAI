// Public types for @rechnungsai/pdf. Tagged-union return shapes — caller
// pattern-matches on `kind`; no exceptions cross the package boundary (P2 §4.2).

export type ZugferdProfile =
  | "MINIMUM"
  | "BASIC-WL"
  | "BASIC"
  | "EN16931"
  | "EXTENDED"
  | "XRECHNUNG"
  | "UNKNOWN";

export type ExtractedAttachment = {
  filename: string;
  /** MIME type from /Subtype, lower-cased. */
  mimeType?: string;
  /** Relationship from /AFRelationship, e.g. 'Source', 'Alternative'. */
  relationship?: string;
  /** Raw bytes of the embedded file stream. */
  bytes: Uint8Array;
};

export type ZugferdExtractionResult =
  | {
      kind: "found";
      filename: string;
      xml: string;
      /** Profile detection happens in @rechnungsai/validation. This is always null here. */
      profile: null;
    }
  | { kind: "not-zugferd"; reason: string }
  | { kind: "error"; reason: string; detail?: string };
