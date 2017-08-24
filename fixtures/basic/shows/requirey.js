export default ({ require }) => () => {
    var lib = require('../lib/commonjs/upper');
    return lib.testing;
}
