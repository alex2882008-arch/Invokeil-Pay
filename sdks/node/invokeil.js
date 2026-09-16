/**
 * Invokeil Pay — Node.js entry point.
 * Re-exports the shared zero-dependency SDK (works with `require` and `import`).
 */
module.exports = require('../js/invokeil.js');
module.exports.default = module.exports.InvokeilPay;
