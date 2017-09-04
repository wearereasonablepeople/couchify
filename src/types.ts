export type Attachment = {
    id?: string
    content_type: string
    data: string
}

export type CouchifyOptions = {
    id?: string
    baseDocumentsDir?: string
    attachmentsDir?: string
    babelPlugins?: any[]
    babelPresets?: any[]
    filtersDir?: string
    listsDir?: string
    showsDir?: string
    updatesDir?: string
    viewsDir?: string
    globIgnorePatterns?: string[]
}

export type DependencyResolution = {
    deps: { [s: string]: string }
    file: string
    id: string
    source: string
}

export type DesignDocument = {
    _id: string
    language: string
    _rev?: string
    _attachments?: { [key: string]: Attachment }
    commons?: { [key: string]: string }
    views?: {
        lib?: { [key: string]: string }
        [key: string]: string | { [key: string]: string }
    }
    shows?: { [key: string]: string }
    lists?: { [key: string]: string }
    filters?: { [key: string]: string }
    updates?: { [key: string]: string }
    rewrites?: Rewrite[]
}

export type FunctionResolution = DependencyResolution & {
    entry?: boolean
    exports: { [s: string]: string }
    resolvedDeps: DependencyResolution[]
    type: string
}

export type Rewrite = {
    from: string
    to: string
    method: string
    query: { [key: string]: string }
}

export type ViewFunctionResolution = FunctionResolution | {
    source: { map: string, reduce: string }
}
