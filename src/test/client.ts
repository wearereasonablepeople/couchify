import * as test from 'tape'
import { urlToCouchdbOptions } from '../client'

test('url to couchdb options', t => {
    t.deepEqual(80, urlToCouchdbOptions('https://host:80/a').port, 'should not override port number')
    t.deepEqual(5984, urlToCouchdbOptions('https://host/a').port, 'should provide default port')
    t.deepEqual('http', urlToCouchdbOptions('localhost').protocol, 'should provide default protocol')
    t.deepEqual('localhost', urlToCouchdbOptions('http://localhost:80').host, 'should not include port in host')
    t.deepEqual('magnet', urlToCouchdbOptions('magnet://localhost:80').protocol, 'should not include colon in protocol')
    t.end()
})
