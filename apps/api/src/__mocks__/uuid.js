// CJS shim for uuid v14 (ESM-only) used in Jest test runs.
// v1 (if ever called) returns a v4-format string here; no current call site uses v1.
const { randomUUID } = require('crypto');
module.exports = {
  v4: () => randomUUID(),
  v1: () => randomUUID(),
};
