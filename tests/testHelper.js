import { EventEmitter } from 'events';

/**
 * Dispatches an HTTP request directly to an Express app without TCP sockets,
 * perfectly compatible with sandboxed execution environments.
 */
export function dispatchRequest(app, { method = 'GET', url = '/', headers = {}, body = null, cookies = {} }) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    req.method = method.toUpperCase();
    req.url = url;
    req.originalUrl = url;
    req.headers = {
      'content-type': 'application/json',
      ...headers,
    };
    req.ip = '127.0.0.1';
    req.socket = { remoteAddress: '127.0.0.1' };
    req.cookies = cookies;
    req.body = body || {};

    const headersMap = {};

    const res = {
      statusCode: 200,
      headersSent: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(name, value) {
        headersMap[name.toLowerCase()] = value;
      },
      getHeader(name) {
        return headersMap[name.toLowerCase()];
      },
      hasHeader(name) {
        return Boolean(headersMap[name.toLowerCase()]);
      },
      removeHeader(name) {
        delete headersMap[name.toLowerCase()];
      },
      getHeaderNames() {
        return Object.keys(headersMap);
      },
      getHeaders() {
        return { ...headersMap };
      },
      cookie(name, val, options) {
        this._cookies = this._cookies || {};
        this._cookies[name] = { val, options };
      },
      clearCookie(name) {
        if (this._cookies) delete this._cookies[name];
      },
      json(data) {
        this.setHeader('content-type', 'application/json');
        this.body = data;
        resolve({
          status: this.statusCode,
          headers: headersMap,
          body: data,
        });
      },
      send(data) {
        this.body = data;
        resolve({
          status: this.statusCode,
          headers: headersMap,
          body: data,
        });
      },
      end(chunk) {
        resolve({
          status: this.statusCode,
          headers: headersMap,
          body: this.body || chunk,
        });
      },
    };

    try {
      app(req, res, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            status: 404,
            headers: headersMap,
            body: { success: false, message: 'Not found' },
          });
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
