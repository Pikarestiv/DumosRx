// Deterministic, UUID-shaped ids.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-deterministic-id-L1

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

function lane(salt: number, input: string): string {
  return fnv1a(`${salt}\0${input}`).toString(16).padStart(8, "0");
}

// A stable id for `parts`.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-deterministic-id-ts-L20
export function deterministicId(...parts: (string | number)[]): string {
  const input = parts.join("\0");
  const hex = lane(0, input) + lane(1, input) + lane(2, input) + lane(3, input);

  const version = `5${hex.slice(13, 16)}`;
  const variantNibble = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const variant = `${variantNibble}${hex.slice(17, 20)}`;

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${version}-${variant}-${hex.slice(20, 32)}`;
}

// The stock batch a receipt against one purchase-order line creates.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-deterministic-id-L57
export function receiptBatchId(poItemId: string, alreadyReceived: number): string {
  return deterministicId("po_receipt_batch", poItemId, alreadyReceived);
}

// The stock movement accompanying that batch — same key, so it collapses with it.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-deterministic-id-ts-L42
export function receiptMovementId(poItemId: string, alreadyReceived: number): string {
  return deterministicId("po_receipt_movement", poItemId, alreadyReceived);
}
