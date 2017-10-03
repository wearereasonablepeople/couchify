export enum ErrorType {
    NOT_FOUND_BASE_DOCUMENTS_DIR,
    NOT_PROVIDED_BASE_DOCUMENTS_DIR,
    NOT_PROVIDED_ID,
    NOT_UNIQUE_DIRNAMES,
    COULD_NOT_INSERT,
    NO_EXPORT
}

const messages = {
    [ErrorType.COULD_NOT_INSERT]: 'could not insert data',
    [ErrorType.NOT_FOUND_BASE_DOCUMENTS_DIR]: 'base directory does not exist',
    [ErrorType.NOT_PROVIDED_BASE_DOCUMENTS_DIR]: 'you must provide a directory',
    [ErrorType.NOT_PROVIDED_ID]: 'you must provide a design document name',
    [ErrorType.NOT_UNIQUE_DIRNAMES]: 'design function directory names must be unique',
    [ErrorType.NO_EXPORT]: 'a design document did not export a default function'
}

export class CouchifyError extends Error {
    constructor(public type: ErrorType, public extra?: string) {
        super(messages[type] + (extra ? ': ' + extra : ''))
    }
}
