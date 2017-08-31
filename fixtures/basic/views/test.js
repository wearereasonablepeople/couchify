export const map = ({ emit, require }) => (doc) => {
    emit(doc._id, require('../lib/foo').bar)
}
