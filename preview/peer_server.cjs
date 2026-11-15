// Local signalling server, used only by the two-browser test.
const { PeerServer } = require('peer');
PeerServer({ port: 9000, host: '127.0.0.1', path: '/' });
console.log('peer server on 127.0.0.1:9000');
