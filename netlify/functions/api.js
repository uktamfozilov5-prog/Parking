const serverless = require('serverless-http');
const app = require('../../server');

const expressHandler = serverless(app);

exports.handler = (event, context) => {
    const functionPrefix = '/.netlify/functions/api';
    const requestUrl = new URL(event.rawUrl || `https://${event.headers.host}${event.path}`);
    const eventPath = event.path.split('?')[0];
    const requestPath = eventPath.startsWith(functionPrefix)
        ? eventPath.slice(functionPrefix.length) || '/'
        : eventPath;

    requestUrl.pathname = requestPath;

    return expressHandler({
        ...event,
        path: requestPath,
        rawUrl: requestUrl.toString()
    }, context);
};
