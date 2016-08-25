'use strict';
var GameProxy = require('./proxy');

new GameProxy({
	// BF2 sv.interfaceIP address  
    serverAddress: '127.0.0.1',
    serverPort: 16567,
    // Bind to server's public address (do not use 0.0.0.0)
    proxyAddress: '0.0.0.0', 
    proxyPort: 16567,
    socketTimeout: 10000,
    //banTimeout: 30 * 60 * 1000
}).start();
