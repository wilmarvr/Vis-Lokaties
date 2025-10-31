const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const root = path.resolve(__dirname);
const port = Number(process.env.PORT) || 8080;
const pkg = (() => { try { return require('./package.json'); } catch(_){ return {version:'0.0.0'}; } })();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

let gitMetaCache = null;
let gitMetaTime = 0;

function getGitMeta(cb){
  const now = Date.now();
  if(gitMetaCache && (now - gitMetaTime) < 5000){ cb(null, gitMetaCache); return; }
  exec('git rev-parse --abbrev-ref HEAD', {cwd:root}, (branchErr, branchStd = '') => {
    exec('git rev-parse HEAD', {cwd:root}, (commitErr, commitStd = '') => {
      gitMetaCache = {
        branch: branchErr ? null : (branchStd.trim() || null),
        commit: commitErr ? null : (commitStd.trim() || null)
      };
      gitMetaTime = Date.now();
      cb(null, gitMetaCache);
    });
  });
}

function safeJoin(base, target){
  const normalised = target.replace(/\\/g, '/').replace(/^\//, '');
  const resolved = path.resolve(base, normalised);
  if(resolved === base){ return resolved; }
  if(!resolved.startsWith(base + path.sep)){ return null; }
  return resolved;
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if(urlPath === '/meta.json'){
    getGitMeta((_, meta = {}) => {
      const body = JSON.stringify({
        version: (pkg && pkg.version) ? pkg.version : '0.0.0',
        branch: meta.branch || null,
        commit: meta.commit || null
      });
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(body);
    });
    return;
  }
  let filePath = urlPath;
  if(filePath.endsWith('/')){
    filePath = path.join(filePath, 'index.html');
  }
  if(filePath === '/' || filePath === ''){
    filePath = '/index.html';
  }

  const safePath = safeJoin(root, filePath);
  if(!safePath){
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if(err){
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    if(stats.isDirectory()){
      const indexPath = path.join(safePath, 'index.html');
      fs.stat(indexPath, (idxErr, idxStats) => {
        if(idxErr || !idxStats.isFile()){
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        streamFile(indexPath, res);
      });
      return;
    }

    if(stats.isFile()){
      streamFile(safePath, res);
      return;
    }

    res.writeHead(403);
    res.end('Forbidden');
  });
});

function streamFile(filePath, res){
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {'Content-Type': mime});
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    res.writeHead(500);
    res.end('Server error');
  });
  stream.pipe(res);
}

server.listen(port, () => {
  console.log(`Vis Lokaties dev server running at http://localhost:${port}`);
});
