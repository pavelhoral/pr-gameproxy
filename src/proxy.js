'use strict';
var dgram = require('dgram');

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
                var key = this.peerKey(peer),
                    client = this.clients[key];
                if (this.bans[peer.address]) {
                    console.warn('Rejecting connection due to banned IP %s.', peer.address);
                } else if (!client) {
                    console.log('Creating new connection for %s.', key);
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
        if (message[0] & 0x0F === 0x0F &&
                message[12] === 0x01 && message[13] | message[14] | message[15] === 0x00 &&
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
            console.warn('Invalid player name \'%s\' on %s.', playerName, client.peer.address);
            this.banPeer(client.peer);
        } else if (Object.keys(this.clients).some(key => this.clients[key].playerName === playerName)) {
            console.warn('Duplicate player name \'%s\' on %s.', playerName, client.peer.address);
        } else {
            console.log('Detected player \'%s\' on %s.', playerName, client.peer.address);
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
            console.log('Banning IP %s.', peer.address);
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
                console.warn('Timeout on socket %s.', key);
                this.closeClient(key);
            }
        });
    }

    handleBanTimeouts() {
        var timeout = Date.now() - this.options.banTimeout;
        Object.keys(this.bans).forEach(key => {
            if (this.bans[key].timestamp < timeout) {
                console.log('Releasing IP ban for %s.', key);
                delete this.bans[key];
            }
        });
    }

}

module.exports = GameProxy;
