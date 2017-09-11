import * as http from 'http'
import * as test from 'tape'
import { deploy } from '../client'
import { couchify } from '../couchify'
import * as types from '../types'

const fixturesDir = __dirname + '/../../fixtures'

const CouchDBClient = require('couchdb-client')

const client = new CouchDBClient({
    host: 'localhost',
    port: 5984
})

const extraOptions = {
    'babel-plugin': {
        babelPlugins: ['transform-function-bind']
    }
}

const testDb = 'couchify-test'

const expected = {
    basic: [
        'simple:ok',
        'requirey:PLANKTON42'
    ],
    gamma: [
        'foo:fruits23.999999999999996\n'
    ],
    'babel-plugin': [
        'foo:666'
    ]
}

test('couchdb', t => {
    client.welcome((welcomeErr, welcomeData) => {
        t.error(welcomeErr)
        t.equal(JSON.parse(welcomeData).couchdb, 'Welcome')

        client.getDB(testDb, (getErr, getData) => {
            if (getErr) {
                if (getErr.error === 'not_found') {
                    client.createDB(testDb, (createErr, createData) => {
                        t.error(createErr)
                        t.ok(createData.ok)
                        t.end()
                        runTests()
                    })
                } else {
                    t.error(getErr)
                }
            } else {
                t.end()
                runTests()
            }
        })
    })
})

function runTests() {
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

            couchify(opts)
                .then((doc: types.DesignDocument) => {
                    deploy({ remote: 'localhost:5984', db: testDb, doc })
                        .then(res => {
                            t.ok(res.ok)
                            t.equal(res.id, doc._id)
                            let i = 0

                            expected[d].forEach(pair => {
                                const [fnName, expectedText] = pair.split(':')
                                http.request({
                                    host: 'localhost',
                                    port: 5984,
                                    method: 'GET',
                                    path: `/${testDb}/${doc._id}/_show/${fnName}`
                                }, httpRes => {
                                    httpRes.on('data', data => {
                                        t.equal(data.toString(), expectedText)
                                        if (++i === expected[d].length) {
                                            t.end()
                                        }
                                    })
                                    httpRes.on('error', t.error)
                                }).end()
                            })
                        })
                        .catch(deployErr => {
                            t.error(deployErr)
                        })
                }).catch(er => {
                    t.error(er)
                })
        })
    })

        ;

    [
        'attachments'
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
}

test('fixtures/custom-dirs', t => {
    let opts = {
        id: 'custom-dirs',
        baseDocumentsDir: fixturesDir + '/custom-dirs',
        showsDir: 's',
        viewsDir: 'v'
    }

    couchify(opts).then(actual => {
        t.deepEqual(actual, require(fixturesDir + '/custom-dirs/expected.json'))
        t.end()
    }).catch(er => t.error(er))
})
