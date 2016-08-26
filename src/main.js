'use strict';
/*
 * Project Reality game protocol reverse proxy.
 * Uses ES6 constructs, so don't forget tu run with --harmony option.
 */
var GameProxy = require('./proxy');

new GameProxy({
    // Local sv.interfaceIP address
    serverAddress: '127.0.0.1',
    serverPort: 16567,
    // Public sv.serverIP address
    proxyAddress: '0.0.0.0',
    proxyPort: 16567,
    socketTimeout: 10000,
    //banTimeout: 30 * 60 * 1000
}).start();
