export default ({ emit }) => (doc) => {
    emit(doc._id, require('../lib/foo').bar)
}
