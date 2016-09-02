'use strict';

/**
 * You can enter path to your server installation here (defaults to CWD).
 */
var base = process.env.SERVER_BASE || '';

/**
 * Create the game proxy.
 */
var proxy = require('./proxy').create(base);

// Start the poxy
proxy.start();

// Create control server
//proxy.control(9080);
