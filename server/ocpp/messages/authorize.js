// Phase 1: accept all ID tags unconditionally
async function handleAuthorize(chargePointId, payload) {
  return {
    idTagInfo: { status: 'Accepted' },
  };
}

module.exports = handleAuthorize;
