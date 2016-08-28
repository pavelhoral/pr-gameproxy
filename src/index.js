'use strict';

/**
 * You can enter path to your server installation here (defaults to parent directory).
 */
var base = '';

/**
 * Create the game proxy.
 */
var proxy = require('./proxy').create(base);

// Start the poxy
proxy.start();

// Create control server
//proxy.control(9080);
