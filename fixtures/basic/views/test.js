export const map = ({ emit }) => (doc) => {
    emit(doc._id, require('../lib/foo').bar)
}
