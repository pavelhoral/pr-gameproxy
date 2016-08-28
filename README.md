# Project Reality Game Protocol Proxy

Simple game protocol proxy to sit between clients (players) and the game server. Proxy detects and validates player names.

The proxy is a simple NodeJS script without any external dependencies. Script is using ES6 constructs so NodeJS 6+ is required.

The central idea behind the proxy is:

* your PR server listens only on localhost (sv.serverIP configuration)
* proxy is the one listening on the public interface and accepting client connections
* when the proxy validates an incomming packet, it then forwards it to the actual server

## Installation

Copy proxy files inside server installation directory `${serverBase}/proxy` (this will allow proxy to autodetect its configuration).

You need to update your server configuration (`mods/pr/settings/serversettings.con`):

* change `sv.serverIP` to localhost (`127.0.0.1`)
* change `sv.interfaceIP` to your public IP address (the one that should be reported to master server
* enable NAT negotiation by setting `allowNATNegotiation` to `1`

## Running The Proxy

    node --harmony proxy/main >> proxy.log
