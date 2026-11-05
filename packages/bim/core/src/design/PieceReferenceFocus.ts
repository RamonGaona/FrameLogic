/** Transient UI focus only; does not mutate persistent piece data. */
export type PieceReferenceFocus = { readonly kind: "SNAP" | "AXIS"; readonly id: string } | null;
