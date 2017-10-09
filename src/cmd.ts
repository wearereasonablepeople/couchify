import * as minimist from 'minimist'
import * as path from 'path'
import * as client from './client'
import { couchify } from './couchify'
import { CouchifyOptions, DesignDocument } from './interfaces'

const argv: any = minimist(process.argv.slice(2), {
    alias: {
        r: 'remote',
        n: 'name',
        y: 'dry',
        v: 'version',
        h: 'help',
        t: 'timeout'
    },
    default: {
        name: 'default',
        db: 'default',
        remote: 'http://localhost:5984',
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
    const baseDocumentsDir = path.resolve(dir)

    const options = {
        baseDocumentsDir: baseDocumentsDir,
        id: argv.name
    } as CouchifyOptions

    ;['filters-dir', 'shows-dir', 'lists-dir', 'updates-dir', 'views-dir'].forEach(key => {
        if (argv.hasOwnProperty(key)) {
            options[kebabToCamelCase(key)] = argv[key]
        }
    })


    couchify(options).then((designDocument: DesignDocument) => {

        const deployOptions = {
            remote: argv.remote,
            db: argv.db,
            doc: designDocument,
            timeout: Number(argv.timeout) || 5000
        }

        if (!argv.dry) {
            return client
                .deploy(deployOptions)
                .then(res => {
                    if (res.ok) {
                        console.log(JSON.stringify(res))
                        process.exit(0)
                    } else {
                        console.error('[error] unexpected response: \n' + JSON.stringify(res, null, 2))
                        process.exit(1)
                    }
                })
        } else {
            console.log(JSON.stringify(designDocument, null, 2))
            process.exit(0)
        }
    }).catch(er => {
        console.error('[error] ' + er.message)
        process.exit(1)
    })

}

function showUsage() {
    const usage =
        `couchify DIR [OPTIONS]

Options:
  --db           Database name.         [default: default]
  -n, --name     Design document name.  [default: default]
  -r, --remote   CouchDB endpoint.      [default: http://localhost:5984]
  -t, --timeout  CouchDB timeout (ms).  [default: 5000]
  --filters-dir  Filters directory.     [default: filters]
  --lists-dir    Lists directory.       [default: lists]
  --shows-dir    Shows directory.       [default: shows]
  --updates-dir  Updates directory.     [default: updates]
  --views-dir    Views directory.       [default: views]
  -y, --dry      Dry run.               [default: false]
  -v, --version  Show version number.
  -h, --help     Show this message.
`
    console.log(usage)
    process.exit(0)
}

function kebabToCamelCase(s: string): string {
    return s.replace(/(\-\w)/g, m => m[1].toUpperCase())
}
