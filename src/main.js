'use strict';

/**
 * You can enter path to your server installation here (defaults to parent directory).
 */
var base = '';

/**
 * Create and start the game proxy.
 */
require('./proxy').create(base).start();
