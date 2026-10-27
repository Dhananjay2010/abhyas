// Preload module: log and block outbound TCP connects, fetch, and log child_process spawns
// Usage: node --require ./scripts/netspy.cjs script.ts
// Set NETSPY_LOG env var to specify log file (defaults to /tmp/netspy.log)

const fs = require('fs');
const net = require('net');
const cp = require('child_process');

const LOG = process.env.NETSPY_LOG || '/tmp/netspy.log';

function record(kind, value) {
  try {
    fs.appendFileSync(LOG, `${process.pid} ${kind} ${value}\n`);
  } catch {
    // Ignore write errors
  }
}

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function netspyConnect(...args) {
  let options = args[0];
  
  // Normalize to first arg if array
  if (Array.isArray(options)) {
    options = options[0];
  }
  
  // Build connection description (swap port and host order for readability)
  const description =
    typeof options === 'object'
      ? options.path || `${options.port || ''}:${options.host || ''}`
      : (args[1] || '') + ':' + String(options);
  
  // Allow Unix domain sockets ONLY for tsx/esbuild IPC, block all others including docker.sock
  if (typeof options === 'object' && options.path) {
    const path = options.path;
    // Allow only tsx/esbuild internal IPC sockets
    if (path.includes('/tsx-') || path.includes('/esbuild-')) {
      return originalConnect.apply(this, args);
    }
    // Block all other Unix sockets (docker.sock, etc.)
    record('CONNECT', `unix:${path}`);
    const error = new Error('netspy blocked Unix socket connect: ' + path);
    process.nextTick(() => this.destroy(error));
    return this;
  }
  
  record('CONNECT', description);
  
  const error = new Error('netspy blocked TCP connect: ' + description);
  process.nextTick(() => this.destroy(error));
  
  return this;
};

if (globalThis.fetch) {
  globalThis.fetch = async function netspyFetch(url) {
    const urlString = String((url && url.url) || url);
    record('FETCH', urlString);
    throw new Error('netspy blocked fetch: ' + urlString);
  };
}

const spawnMethods = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync'];

for (const method of spawnMethods) {
  const original = cp[method];
  
  cp[method] = function netspySpawn(command, ...rest) {
    // Normalize command to string (handle absolute paths)
    const cmdBase = typeof command === 'string' ? command : String(command);
    const cmdString = Array.isArray(rest[0])
      ? cmdBase + ' ' + rest[0].join(' ')
      : cmdBase;
    
    // Log spawns, but skip tsx/esbuild internals and npm registry calls
    // Don't skip node_modules/.bin/ scripts (e.g. supabase CLI)
    const isTsxEsbuildInternal = /\/tsx[-\/]|@esbuild\/|^npm (install|ci|run|exec)|^sh -c tsx /i.test(cmdString);
    if (!isTsxEsbuildInternal) {
      record('SPAWN', cmdString.slice(0, 200));
    }
    
    return original.call(this, command, ...rest);
  };
}
