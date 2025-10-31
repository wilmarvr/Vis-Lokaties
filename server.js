const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname);
const port = Number(process.env.PORT) || 8080;

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

function safeJoin(base, target){
  const normalised = target.replace(/\\/g, '/').replace(/^\//, '');
  const resolved = path.resolve(base, normalised);
  if(resolved === base){ return resolved; }
  if(!resolved.startsWith(base + path.sep)){ return null; }
  return resolved;
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
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
