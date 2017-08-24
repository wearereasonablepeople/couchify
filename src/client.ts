import * as url from 'url'
import { DesignDocument } from './couchify'
const NodeCouchDb = require('node-couchdb')

export function splitUrlIntoParts(remote: string): { host: string, port: number, protocol: string } {
    if (!remote.startsWith('http')) {
        remote = remote.replace(/^.+\:\/+/, '')
        remote = 'http://' + remote
    }

    const parsedUrl = url.parse(remote)
    const protocol = parsedUrl.protocol.replace(/\:+$/, '')

    return {
        host: parsedUrl.host.replace(/\:+\d+$/, ''),
        port: parsedUrl.port
            ? parseInt(parsedUrl.port, 10)
            : (protocol === 'https' ? 443 : 80),
        protocol: protocol
    }
}

export type DeployOptions = {
    remote?: string
    db?: string
    doc?: DesignDocument
    user?: string
    pass?: string
}

export function deploy({ remote, db, doc, user, pass }: DeployOptions) {
    const opts = splitUrlIntoParts(remote) as DeployOptions

    if (user && pass) {
        opts.user = user
        opts.pass = pass
    }

    const couch = new NodeCouchDb(opts)

    return couch
        .get(db, doc._id)
        .then(({ data: getData, headers: getHeaders, status: getStatus }) =>
            couch.update(db, { ...doc, ...{ _rev: getData._rev } }).then(({ data: updateData }) => updateData),
        (getErr) => {
            if (getErr.code === 'EDOCMISSING') {
                return couch
                    .insert(db, doc)
                    .then(({ data: insertData, headers: insertHeaders, status: insertStatus }) => {
                        return insertData
                    }, (insertErr) => {
                        throw new Error('could not insert data')
                    })
            } else {
                throw new Error('unexpected error')
            }
        })

}
