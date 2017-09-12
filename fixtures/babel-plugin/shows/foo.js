export default () => () => {
    const bar = require('../bar')
    const ctx = { x: 663 }
    return String(ctx::bar(3))
}
