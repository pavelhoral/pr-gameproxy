'use strict';
var dgram = require('dgram');

class Logger {

    constructor(name) {
        this.name = name;
    }

    debug(message, ...args) {
        this.log('DEBUG', message, ...args);
    }

    info(message, ...args) {
        this.log('INFO', message, ...args);
    }

    warn(message, ...args) {
        this.log('WARN', message, ...args);
    }

    error(message, ...args) {
        this.log('ERROR', message, ...args);
    }

    log(level, message, ...args) {
        console.log('[%s] %s [%s] ' + message, new Date().toISOString(), level, this.name, ...args);
    }

}

class GameProxy {

    constructor(options) {
        this.options = options;
        this.logger = new Logger('PROXY');
        this.socket = null;
        this.clients = {};
        this.bans = {};
    }

    start() {
        this.socket = dgram.createSocket('udp4').
            on('listening', () => {
                this.logger.info('Game proxy listening on port %d.', this.options.proxyPort);
            }).
            on('message', (message, peer) => {
                var key = this.peerKey(peer),
                    client = this.clients[key];
                if (this.bans[peer.address]) {
                    this.logger.warn('Rejecting connection due to banned IP %s.', peer.address);
                    return;
                } else if (!client) {
                    this.logger.debug('Creating new connection for %s.', key);
                    client = this.createClient(peer);
                }
                this.process(client, message);
            }).
            bind(this.options.proxyPort, this.options.proxyAddress);
        setInterval(() => this.handleSocketTimeouts(), 1000);
        if (this.options.banTimeout) {
            setInterval(() => this.handleBanTimeouts(), 60000);
        }
    }

    peerKey(peer) {
        return peer.address + ':' + peer.port;
    }

    createClient(peer) {
        var client = dgram.createSocket('udp4').
            on('message', (message) => {
                this.socket.send(message, peer.port, peer.address);
            });
        client.peer = peer;
        this.clients[this.peerKey(peer)] = client;
        return client;
    }

    process(client, message) {
        client.timestamp = Date.now();
        if (message.length > 30 &&
                message[0] & 0x0F === 0x0F && message.readUInt32LE(12) === 0x01 &&
                message[17] | message[18] | message[19] === 0x00 && message[20] === 0x04) {
            this.processClientInfo(client, message);
        } else {
            client.send(message, this.options.serverPort, this.options.serverAddress);
        }
    }

    processClientInfo(client, message) {
        var nameLength = message.readUInt16LE(22),
            playerName = message.toString('ascii', 24, 24 + nameLength);
        if (playerName.indexOf('\u0000') > -1) {
            this.logger.warn('Invalid player name \'%s\' on %s.', playerName, client.peer.address);
            this.banPeer(client.peer);
        } else if (Object.keys(this.clients).some(key => this.clients[key].playerName === playerName)) {
            this.logger.warn('Duplicate player name \'%s\' on %s.', playerName, client.peer.address);
        } else {
            this.logger.debug('Detected player \'%s\' on %s.', playerName, client.peer.address);
            client.playerName = playerName;
            client.send(message, this.options.serverPort, this.options.serverAddress);
        }
    }

    closeClient(key) {
        if (this.clients[key]) {
            this.clients[key].close();
            delete this.clients[key];
        }
    }

    banPeer(peer) {
        if (this.options.banTimeout) {
            this.logger.info('Banning IP %s.', peer.address);
            this.closeClient(this.peerKey(peer));
            this.bans[peer.address] = {
                timestamp: Date.now()
            };
        }
    }

    handleSocketTimeouts() {
        var timeout = Date.now() - this.options.socketTimeout;
        Object.keys(this.clients).forEach(key => {
            if (this.clients[key].timestamp < timeout) {
                this.logger.debug('Timeout on socket %s.', key);
                this.closeClient(key);
            }
        });
    }

    handleBanTimeouts() {
        var timeout = Date.now() - this.options.banTimeout;
        Object.keys(this.bans).forEach(key => {
            if (this.bans[key].timestamp < timeout) {
                this.logger.info('Releasing IP ban for %s.', key);
                delete this.bans[key];
            }
        });
    }

}

module.exports = GameProxy;
