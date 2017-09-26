import * as path from 'path'
import * as pump from 'pump'
import * as uniq from 'uniq'
import { CouchifyError, ErrorType } from './error'
import { formatAsAttachmentEntry, formatAsDesignFunctionEntry } from './formatters'
import { accessAsync, glob, readFileAsync } from './helpers'
import {
    Attachment,
    CouchifyOptions,
    DependencyResolution,
    DesignDocument,
    FunctionResolution
} from './interfaces'
import { ViewFunctionResolution } from './types'
const babelify = require('babelify')
const moduleDeps = require('module-deps')
const moduleSort = require('deps-sort')
const transformDeps = require('transform-deps')
const toArray = require('stream-to-array')
const toposort = require('toposort')

const defaultOptions: CouchifyOptions = {
    attachmentsDir: 'public',
    filtersDir: 'filters',
    listsDir: 'lists',
    showsDir: 'shows',
    updatesDir: 'updates',
    viewsDir: 'views',
    globIgnorePatterns: ['**/node_modules/**'],
    babelPresets: [],
    babelPlugins: []
}

const MODULE_EXPORTS = 'module.exports='

export function couchify(options: CouchifyOptions): Promise<DesignDocument> {
    options = { ...defaultOptions, ...options }

    if (!options.baseDocumentsDir) {
        return Promise.reject(new CouchifyError(ErrorType.NOT_PROVIDED_BASE_DOCUMENTS_DIR))
    }

    if (!options.id) {
        return Promise.reject(new CouchifyError(ErrorType.NOT_PROVIDED_ID))
    }

    const designFunctionDirs = uniq([
        options.filtersDir,
        options.listsDir,
        options.showsDir,
        options.updatesDir,
        options.viewsDir
    ])

    if (designFunctionDirs.length !== 5) {
        return Promise.reject(new CouchifyError(ErrorType.NOT_UNIQUE_DIRNAMES))
    }

    const baseDocumentsDir = path.resolve(options.baseDocumentsDir)
    const attachmentsDir = path.join(baseDocumentsDir, options.attachmentsDir)

    const globOptions = { ignore: options.globIgnorePatterns, nodir: true }

    return accessAsync(baseDocumentsDir).then(() => _couchify(options, globOptions, designFunctionDirs, attachmentsDir, baseDocumentsDir))
}

function _couchify(options: CouchifyOptions, globOptions, designFunctionDirs: string[], attachmentsDir: string, baseDocumentsDir: string): Promise<DesignDocument> {
    return Promise.all([
        glob(`+(${designFunctionDirs.join('|')})/*.{${['js', 'json' /* TODO: test json */]}}`, { ...globOptions, ...{ cwd: baseDocumentsDir } }),
        glob('**/*', { ...globOptions, ...{ cwd: attachmentsDir } })
    ]).then(([designFiles, attachmentFiles]) => {

        const designTasks = designFiles
            .map(relativePath =>
                resolveDependencies(path.join(baseDocumentsDir, relativePath), options)
                    .then(deps => formatAsDesignFunctionEntry(baseDocumentsDir, relativePath, deps, options)))

        const attachmentTasks = attachmentFiles
            .map(relativePath => {
                const absPath = path.join(attachmentsDir, relativePath)
                return readFileAsync(absPath).then(data => formatAsAttachmentEntry(attachmentsDir, relativePath, absPath, data))
            })

        return Promise.all([Promise.all(designTasks), Promise.all(attachmentTasks)]).then(([entries, attachments]) => {

            const resolvedDeps: DependencyResolution[] = []
            const rewriteTasks: Promise<any>[] = []

            const resolutionIndex = entries.reduce((acc, entry) => {
                entry.resolvedDeps
                    .filter(d => !(acc.hasOwnProperty(d.file)))
                    .forEach(d => {
                        resolvedDeps.push(d)
                        acc[d.file] = resolvedDeps.length - 1
                        rewriteTasks.push(
                            rewriteRequires(d.source, name => {
                                return `./${acc[d.deps[name]]}`
                            })
                                .then(code => {
                                    d.source = code
                                    return d
                                })
                        )
                    })

                rewriteTasks.push(entry.type !== 'views'
                    ? rewriteRequires(MODULE_EXPORTS + entry.exports.default, name => `commons/${acc[entry.deps[name]]}`)
                        .then(code => {
                            entry.source = code.slice(MODULE_EXPORTS.length)
                            return entry
                        })
                    : Promise.all([entry.exports.map, entry.exports.reduce].map(d => {
                        return !d
                            ? null
                            : rewriteRequires(MODULE_EXPORTS + ' ' + d, name => `views/lib/${acc[entry.deps[name]]}`)
                    })).then(([map, reduce]) => {
                        (entry as ViewFunctionResolution).source = {
                            map: map && map.slice(MODULE_EXPORTS.length),
                            reduce: reduce && reduce.slice(MODULE_EXPORTS.length)
                        }
                        return entry
                    })
                )

                return acc
            }, {})

            return Promise.all(rewriteTasks).then(values => designDocument(values, resolutionIndex, resolvedDeps, attachments, options))
        })
    })
}

function resolveDependencies(file: string, options: CouchifyOptions): Promise<DependencyResolution[]> {
    return new Promise((resolve, reject) => {

        const resolver = moduleDeps({
            transform: [[babelify, {
                presets: [['es2015', {}]].concat(options.babelPresets || []),
                plugins: options.babelPlugins || [],
                babelrc: false,
                ast: false,
                comments: false,
                sourceMaps: false
            }]]
        })

        const sorter = moduleSort({ dedupe: true })

        toArray(pump(resolver, sorter), (err, res) => {
            if (err) {
                console.log(err)
                return reject(err)
            }

            if (res.length < 2) {
                return resolve(res)
            }

            const graph = []
            res.forEach(d => {
                Object.values(d.deps).forEach(dep => {
                    graph.push([ d.file, dep ])
                })
            })

            const sortedDeps = toposort(graph).reverse().map(d => {
                return res[res.findIndex(el => el.id === d)]
            })

            const entryIx = sortedDeps.findIndex(d => d.entry === true)
            sortedDeps.push(sortedDeps.splice(entryIx, 1)[0])

            resolve(sortedDeps)
        })

        resolver.end({ file: file })
    })
}

function rewriteRequires(src: string, fn: (name: string) => string | void): Promise<string> {
    return new Promise((resolve) => resolve(transformDeps(src, fn)))
}

function designDocument(values: FunctionResolution[], resolutionIndex, resolvedDeps: DependencyResolution[], attachments: Attachment[], options: CouchifyOptions) {

    const res: DesignDocument = createDesignDocumentTemplate(options);

    if (attachments.length) {
        res._attachments = attachments.reduce((acc, attachment) => {
            acc[attachment.id] = { content_type: attachment.content_type, data: attachment.data }
            return acc
        }, {} as { [key: string]: Attachment })
    }

    const viewsLib: { [key: string]: string } = {}

    values.forEach(value => {
        if (!value.hasOwnProperty('entry')) {
            if (!res.hasOwnProperty('commons')) {
                res.commons = {}
            }

            res.commons[String(resolutionIndex[value.id])] = value.source
        } else {
            if (!res.hasOwnProperty(value.type)) {
                res[value.type] = {}
            }

            const key = path.basename(value.file).replace(path.extname(value.file), '')
            res[value.type][key] = value.source

            if (value.type === 'views') {
                value.resolvedDeps.forEach(d => {
                    viewsLib[String(resolutionIndex[d.id])] = resolvedDeps[resolutionIndex[d.id]].source
                })

                const view = (res.views[key] as any)

                if (view.map === null) {
                    delete view.map
                }

                if (view.reduce === null) {
                    delete view.reduce
                }
            }
        }
    })

    if (Object.keys(viewsLib).length) {
        res.views.lib = viewsLib
    }

    return res
}

function createDesignDocumentTemplate(options: CouchifyOptions): DesignDocument {
    const overrides: DesignDocument = {
        _id: `_design/${options.id}`,
        language: 'javascript'
    };

    try{
        const tmpl = require(path.resolve(options.baseDocumentsDir, 'template'));
        const template = typeof tmpl === 'function' ? tmpl(options) : tmpl;
        return {...template, ...overrides};
    } catch (e) {
        return overrides;
    }
}
