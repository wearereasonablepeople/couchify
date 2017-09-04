import * as minimist from 'minimist'
import * as path from 'path'
import * as client from './client'
import { couchify } from './couchify'
import { readFileAsync } from './helpers'
import { CouchifyOptions, DesignDocument, Rewrite } from './types'

const argv: any = minimist(process.argv.slice(2), {
    alias: {
        'filters-dir': 'filtersDir',
        'shows-dir': 'showsDir',
        'views-dir': 'viewsDir',
        'updates-dir': 'updatesDir',
        'lists-dir': 'listsDir',
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
    const baseDocumentsDir = path.resolve(dir)

    const options = {
        baseDocumentsDir: baseDocumentsDir,
        id: argv.name
    } as CouchifyOptions

        ;

    ['filters-dir', 'shows-dir', 'lists-dir', 'updates-dir', 'views-dir'].forEach(key => {
        if (argv.hasOwnProperty(key)) {
            options[kebabToCamelCase(key)] = argv[key]
        }
    })

    Promise.all([
        couchify(options),
        readFileAsync(path.join(baseDocumentsDir, 'rewrites.json'), 'utf8')
            .then(res => {
                let json = []
                try {
                    json = JSON.parse(res)
                } catch (e) {
                    console.warn('malformed rewrites.json')
                }
                return json
            })
            .catch(readFileErr => [])
    ]).then(([designDocument, rewrites]: [DesignDocument, Rewrite[]]) => {
        if (rewrites.length) {
            designDocument.rewrites = rewrites
        }

        if (!argv.dry) {
            return client
                .deploy({ remote: argv.remote, db: argv.db, doc: designDocument })
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
  -r, --remote   CouchDB endpoint.      [default: localhost:5984]
  -u, --user     CouchDB username.
  -p, --pass     CouchDB password.
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
