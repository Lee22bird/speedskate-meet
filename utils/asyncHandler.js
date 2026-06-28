'use strict';

// Wrap async route handlers so rejected promises reach Express error middleware
// instead of becoming unhandled rejections (Express 4 does not do this automatically).
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
