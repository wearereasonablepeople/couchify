export default ({ require }) => () => {
    const gamma = require('gamma')
    return require('../bar').x + gamma(5) + '\n'
}
