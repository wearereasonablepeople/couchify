import * as minimist from 'minimist'
import * as client from './client'
import { couchify, DesignDocument } from './couchify'

const argv: any = minimist(process.argv.slice(2), {
    alias: {
        u: 'user',
        p: 'pass',
        r: 'remote',
        n: 'name',
        y: 'dry',
        v: 'version',
        h: 'help'
    },
    default: {
        name: 'default',
        db: 'default',
        remote: 'localhost:5984',
        dry: false
    }
})

const dir: string = argv._[0]

if ((!dir && !argv.version) || argv.help) {
    showUsage()
} else if (argv.version) {
    console.log('v' + require(__dirname + '/../package.json').version)
    process.exit(0)
} else {
    couchify({
        baseDocumentsDir: dir,
        id: argv.name
    }).then((result: DesignDocument) => {
        if (!argv.dry) {
            client
                .deploy({ remote: argv.remote, db: argv.db, doc: result })
                .then(res => {
                    if (res.ok) {
                        console.log(JSON.stringify(res))
                        process.exit(0)
                    } else {
                        console.error('unexpected response: \n' + JSON.stringify(res, null, 2))
                        process.exit(1)
                    }
                })
                .catch(e => {
                    console.error('could not deploy: ' + e.message)
                    throw e
                })
        } else {
            console.log(JSON.stringify(result, null, 2))
        }
    }).catch(er => {
        console.error('could not couchify: ' + er.message)
        throw er
    })
}

function showUsage() {
    const usage =
        `couchify DIR [OPTIONS]

Options:
  -n, --name     Design document name.  [default: default]
  -d, --db       Database name.         [default: default]
  -r, --remote   CouchDB endpoint.      [default: localhost:5984]
  -u, --user     CouchDB username.
  -p, --pass     CouchDB password.
  -y, --dry      Dry run.               [default: false]
  -v, --version  Show version number.
  -h, --help     Show this message.
`
    console.log(usage)
    process.exit(0)
}
