// Test stub for `chalk` (ESM-only, used solely for console colouring).
// A chainable proxy: any property access returns the proxy, and calling it
// returns its first argument unchanged — so `chalk.blue.bold('x')` === 'x'.
const proxy = new Proxy(function () {}, {
	get: () => proxy,
	apply: (_target, _thisArg, args) => args[0],
});

module.exports = proxy;
module.exports.default = proxy;
