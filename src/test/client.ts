import * as test from 'tape'
import { splitUrlIntoParts } from '../client'

test('split url into parts', t => {
    t.deepEqual(splitUrlIntoParts('host'), { host: 'host', port: 80, protocol: 'http' })
    t.deepEqual(splitUrlIntoParts('host/a'), { host: 'host', port: 80, protocol: 'http' })
    t.deepEqual(splitUrlIntoParts('host/a/b'), { host: 'host', port: 80, protocol: 'http' })
    t.deepEqual(splitUrlIntoParts('host:34/a/b'), { host: 'host', port: 34, protocol: 'http' })
    t.deepEqual(splitUrlIntoParts('host:34'), { host: 'host', port: 34, protocol: 'http' })
    t.deepEqual(splitUrlIntoParts('host:34/a'), { host: 'host', port: 34, protocol: 'http' })
    t.deepEqual(splitUrlIntoParts('https://host/a'), { host: 'host', port: 443, protocol: 'https' })
    t.deepEqual(splitUrlIntoParts('http://host/a'), { host: 'host', port: 80, protocol: 'http' })
    t.deepEqual(splitUrlIntoParts('http://host:666/a'), { host: 'host', port: 666, protocol: 'http' })
    t.deepEqual(splitUrlIntoParts('https://host:666/a'), { host: 'host', port: 666, protocol: 'https' })
    t.end()
})
