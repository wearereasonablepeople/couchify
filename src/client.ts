import * as url from 'url'
import { CouchifyError, ErrorType } from './error'
import { DesignDocument } from './interfaces'
const NodeCouchDb = require('node-couchdb')

export function splitUrlIntoParts(remote: string): { host: string, port: number, protocol: string } {
    if (!remote.startsWith('http')) {
        remote = remote.replace(/^.+\:\/+/, '')
        remote = 'http://' + remote
    }

    const parsedUrl = url.parse(remote)
    const protocol = parsedUrl.protocol.replace(/\:+$/, '')

    let port = parsedUrl.port && parseInt(parsedUrl.port, 10)

    if (!port || isNaN(port)) {
        port = 5984
    }

    return {
        host: parsedUrl.host.replace(/\:+\d+$/, ''),
        port,
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
                        return Promise.reject(new CouchifyError(ErrorType.COULD_NOT_INSERT, `${insertErr.message}. reason: ${insertErr.body.reason}`))
                    })
            } else {
                return Promise.reject(getErr)
            }
        })

}
