const gregenerapdf = require('../gre/gregenerapdf');

module.exports = async function gremgenerapdf(size, logo, sJson, digestvalue) {
  return gregenerapdf(size, logo, sJson, digestvalue);
};
