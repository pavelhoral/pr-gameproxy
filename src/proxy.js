'use strict';
var dgram = require('dgram'),
    options = {
        serverAddress: '127.0.0.1',
        serverPort: 16568,
        proxyAddress: '0.0.0.0',
        proxyPort: 16567,
        socketTimeout: 10000,
        banTimeout: 30 * 60 * 1000
    };

class GameProxy {

    constructor(options) {
        this.options = options;
        this.socket = null;
        this.clients = {};
        this.bans = {};
    }

    start() {
        this.socket = dgram.createSocket('udp4').
            on('listening', () => {
                console.log('Game proxy listening on port %d.', this.options.proxyPort);
            }).
            on('message', (message, peer) => {
                var key = peer.address + ':' + peer.port,
                    client = this.clients[key];
                if (this.bans[peer.address]) {
                    console.warn('Rejecting connection due to banned IP %s.', peer.address);
                } else if (!client) {
                    console.log('Creating new connection for %s.', key);
                    client = this.createClient(peer);
                    this.clients[key] = client;
                }
                this.process(client, message, peer);
            }).
            bind(this.options.proxyPort, this.options.proxyAddress);
        setInterval(() => this.handleInterval, 1000);
    }

    createClient(peer) {
        return dgram.createSocket('udp4').
            on('message', (message) => {
                this.socket.send(message, peer.port, peer.address);
            });
    }

    process(client, message, peer) {
        client.timestamp = Date.now();
        // TODO validation
        client.send(message, this.options.serverPort, this.options.serverAddress);
    }

    handleTimeout() {
        var timeout = Date.now() - this.options.socketTimeout;
        Object.keys(this.clients).forEach(key => {
            if (this.clients[key].timestamp < timeout) {
                console.warn('Timeout on for socket %s.', key);
                this.clients[key].close();
                delete this.clients[key];
            }
        });
    }

}

module.exports = new GameProxy(options);
