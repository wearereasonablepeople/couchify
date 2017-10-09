import { parse } from 'url'
import { CouchifyError, ErrorType } from './error'
import { DesignDocument } from './interfaces'
const NodeCouchDb = require('node-couchdb')

export function urlToCouchdbOptions(remote: string) : any {
    const opts = parse(remote)
    return {
        host: opts.hostname,
        port: Number(opts.port) || 5984,
        protocol: opts.protocol ? opts.protocol.replace(':', '') : 'http',
        auth: opts.auth,
        timeout: 5000
    }
}

export type DeployOptions = {
    remote: string
    db: string
    doc: DesignDocument
    timeout?: number
}

export function deploy({ remote, db, doc, timeout }: DeployOptions) {
    const opts = urlToCouchdbOptions(remote)
    if (timeout) {
        opts.timeout = timeout
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
