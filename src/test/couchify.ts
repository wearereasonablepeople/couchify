import * as test from 'tape'
import { couchify } from '../couchify'

const fixturesDir = __dirname + '/../../fixtures'

const extraOptions = {
    'babel-plugin': {
        babelPlugins: ['transform-remove-debugger']
    }
}

    ;

[
    'babel-plugin',
    'basic',
    'gamma'
].forEach(d => {
    test('fixtures/' + d, t => {
        let opts = {
            id: d,
            baseDocumentsDir: fixturesDir + '/' + d
        }

        if (extraOptions.hasOwnProperty(d)) {
            opts = { ...opts, ...extraOptions[d] }
        }

        couchify(opts).then(actual => {
            t.deepEqual(actual, require(fixturesDir + '/' + d + '/expected.json'))
            t.end()
        }).catch(er => t.error(er))
    })
})
