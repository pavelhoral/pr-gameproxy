'use strict';
/**
 * Project Reality game protocol reverse proxy.
 *
 * Allows packet inspection to provide additional security and validation before the packets
 * reach the actual PR server.
 *
 * Code uses ES6 constructs, so don't forget to run NodeJS with --harmony option.
 */
var dgram = require('dgram'),
    http = require('http'),
    path = require('path'),
    fs = require('fs');

/**
 * Internal message logger component.
 */
class Logger {

    constructor(name, debug) {
        this.name = name;
        this.debug = debug || false;
    }

    debug(message, ...args) {
        if (this.debug) {
            this.log('DEBUG', message, ...args);
        }
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

/**
 * Actual game proxy component.
 */
class GameProxy {

    /**
     * Create new proxy with the given options. Supported options are:
     * - serverAddress - local sv.serverIP address (defaults to '127.0.0.1')
     * - serverPort - local sv.serverPort port (defaults to 16567)
     * - proxyAddress - public sv.interfaceIP address (no default, needs to be set)
     * - socketTimeout - socket activity timeout in milliseconds (defaults to 10000)
     * - banTimeout - IP ban timeout in milliseconds, set to null to disable (defaults to 10 minutes)
     */
    constructor(options) {
        // Proxy options
        this.options = Object.assign({
            serverAddress: '127.0.0.1',
            serverPort: 16567,
            // proxyAddress: 'THIS CAN NOT HAVE SENSIBLE DEFAULT',
            socketTimeout: 10000,
            banTimeout: 10 * 60000
        }, options);
        // Component logger
        this.logger = new Logger('PROXY', this.options.debug);
        // Public proxy SOCKET
        this.socket = null;
        // Local client SOCKETs
        this.clients = {};
        // IP bans
        this.bans = {};
    }

    /**
     * Start the component and begin traffic forwarding.
     */
    start() {
        // Create public PROXY socket.
        this.socket = dgram.createSocket('udp4').
            on('listening', () => {
                this.logger.info('Game proxy listening on port %d.', this.options.proxyPort);
            }).
            on('message', (message, peer) => {
                var key = this.peerKey(peer),
                    client = this.clients[key];
                if (this.bans[peer.address]) {
                    this.logger.debug('Rejecting connection due to banned IP %s.', peer.address);
                    return;
                } else if (!client) {
                    this.logger.debug('Creating new connection for %s.', key);
                    client = this.createClient(peer);
                }
                this.process(client, message);
            }).
            bind(this.options.serverPort, this.options.proxyAddress);
        // Register SOCKET timeout handler.
        setInterval(() => this.handleSocketTimeouts(), 1000);
        // Register IP BAN timeout handler.
        if (this.options.banTimeout) {
            setInterval(() => this.handleBanTimeouts(), 60000);
        }
        return this;
    }

    /**
     * Get SOCKET hash key in the form of 'IP:PORT'.
     */
    peerKey(peer) {
        return peer.address + ':' + peer.port;
    }

    /**
     * Create new local CLIENT socket.
     */
    createClient(peer) {
        var client = dgram.createSocket('udp4').
            on('message', (message) => {
                this.socket.send(message, peer.port, peer.address);
            });
        client.peer = peer;
        this.clients[this.peerKey(peer)] = client;
        return client;
    }

    /**
     * Process received UDP packet for the given client.
     */
    process(client, message) {
        // Mark client as active (used when checking socket timeouts).
        client.timestamp = Date.now();
        // Do packet specific processing.
        if (message.length > 30 &&
                message[0] & 0x0F === 0x0F && message.readUInt32LE(12) === 0x01 &&
                message[17] | message[18] | message[19] === 0x00 && message[20] === 0x04) {
            this.processClientInfo(client, message);
        } else {
            // By default just forward the packet.
            this.forward(client, message);
        }
    }

    /**
     * Process ClientInfo packet and validate player name.
     */
    processClientInfo(client, message) {
        // XXX Maybe put packet processing and detection into separate class?
        var nameLength = message.readUInt16LE(22),
            playerName = message.toString('ascii', 24, 24 + nameLength);
        if (playerName.indexOf('\u0000') > -1) {
            // Only hacked clients have binary zeros in their name.
            this.logger.warn('Invalid player name \'%s\' on %s.', playerName, client.peer.address);
            this.banPeer(client.peer);
        } else if (Object.keys(this.clients).some(key => this.clients[key].playerName === playerName)) {
            // Duplicate player name - do not forward the packet as it will cause mass CTD.
            if (!client.duplicateName) {
                client.duplicateName = playerName; // Log only once as this packet is send multiple times
                this.logger.warn('Duplicate player name \'%s\' on %s.', playerName, client.peer.address);
            }
        } else {
            // New player name detected for this client.
            this.logger.debug('Detected player \'%s\' on %s.', playerName, client.peer.address);
            delete client.duplicateName;
            client.playerName = playerName;
            this.forward(client, message);
        }
    }

    /**
     * Do forward the UDP packet to the given client.
     */
    forward(client, message) {
        client.send(message, this.options.serverPort, this.options.serverAddress);
    }

    /**
     * Close client socket under the given peer key.
     */
    closeClient(key) {
        if (this.clients[key]) {
            this.clients[key].close();
            delete this.clients[key];
        }
    }

    /**
     * Put the given peer in the banned IP list.
     */
    banPeer(peer) {
        if (this.options.banTimeout) {
            this.logger.info('Banning IP %s.', peer.address);
            this.closeClient(this.peerKey(peer));
            this.bans[peer.address] = {
                timestamp: Date.now()
            };
        }
    }

    /**
     * Check for local client sockets timeout.
     */
    handleSocketTimeouts() {
        var timeout = Date.now() - this.options.socketTimeout;
        Object.keys(this.clients).forEach(key => {
            if (this.clients[key].timestamp < timeout) {
                this.logger.debug('Timeout on socket %s.', key);
                this.closeClient(key);
            }
        });
    }

    /**
     * Check for banned IP timeout.
     */
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


/**
 * Proxy configration builder with the support of loading and validating server configuration.
 *
 * Usage: new ConfigBuilder().load('/opt/prserver').debug(true).options
 */
class ConfigBuilder {

    /**
     * Create new config builder.
     */
    constructor() {
        // Component logger
        this.logger = new Logger('LOADER');
        // Server configuration
        this.config = {};
        // Prepared proxy options
        this.options = {};
    }

    /**
     * Load server configuration from `${serverBase}/mods/pr/settings/serversettings.con`.
     */
    load(serverBase) {
        return this._loadConfig(serverBase)._prepareOptions();
    }

    /**
     * Load server configuration.
     */
    _loadConfig(serverBase) {
        var configPath = path.resolve(serverBase, 'mods/pr/settings/serversettings.con');
        try {
            fs.accessSync(configPath, fs.R_OK);
        } catch (e) {
            throw `Can not read server config '${configPath}'.`;
        }
        fs.readFileSync(configPath, { encoding: 'utf8' }).split('\n').forEach(line => {
            var option = line.trim().split(/\s+(.+)?/, 2);
            if (option.length !== 2 || option[0] === 'rem') {
                return;
            } else  if (/".*"/.test(option[1])) {
                option[1] = option[1].substring(1, option[1].length - 1);
            } else {
                option[1] = parseInt(option[1]);
            }
            this.config[option[0]] = option[1];
        });
        return this;
    }

    /**
     * Prepare proxy options based on the server configuration.
     */
    _prepareOptions() {
        // Process sv.serverIP
        if (!this.config['sv.serverIP']) {
            throw 'Missing sv.serverIP configuration.';
        } else if (this.config['sv.serverIP'] !== '127.0.0.1') {
            this.logger.warn('Unexpected sv.serverIP value \'%s\' (\'127.0.0.1\' expected)',
                    this.config['sv.serverIP']);
        }
        this.options.serverAddress = this.config['sv.serverIP'];
        // Process sv.serverPort
        if (!this.config['sv.serverPort']) {
            throw 'Missing sv.serverPort configuration.';
        }
        this.options.serverPort = this.config['sv.serverPort'];
        // Process sv.interfaceIP
        if (!this.config['sv.serverIP']) {
            throw 'Missing sv.interfaceIP configuration.';
        } else if (this.config['sv.interfaceIP'] === '0.0.0.0') {
            throw `Invalid sv.interfaceIP value '${this.config['sv.interfaceIP']}' (public IP expected).`;
        }
        return this;
    }

    debug(enable) {
        this.options.debug = !!enable;
        return this;
    }

}

/**
 * GameProxy factory method.
 */
GameProxy.create = function(serverBase) {
    if (!serverBase) {
        serverBase = path.resolve(process.argv[1], '..');
    }
    return new GameProxy(new ConfigBuilder().load(serverBase).debug(process.env.DEBUG).options);
};


/**
 * External proxy interface.
 */
class ProxyControl {

    constructor(proxy, options) {
        this.proxy = proxy;
        this.options = options;
        this.logger = new Logger('CONTROL', options.debug);
        this.server = http.createServer(this.handleRequest);
    }

    start() {
        this.server.listen(this.options.controlPort, () => {
            this.logger.info('Control server listening on %d.', this.options.controlPort);
        });
        return this;
    }

    handleRequest(req, res) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write(this.renderStatus());
        res.end('ok');
    }

    renderStatus() {
        return Object.keys(this.proxy.clients).map(key => {
            return key + '\t' + this.proxy.clients[key].playerName;
        }).join('\n');
    }

}

/**
 * ProxyControl factory method.
 */
GameProxy.prototype.control = function(port) {
    return new ProxyControl(this, { controlPort: port }).start();
};
