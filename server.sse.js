const http = require('http');
const Koa = require('koa');
const Router = require('koa-router');
const { streamEvents } = require('http-event-stream');
const uuid = require('uuid');

const app = new Koa();

app.use(async (ctx, next) => {
    const origin = ctx.request.get('Origin');
    if (!origin) {
        return await next();
    }

    const headers = { 'Access-Control-Allow-Origin': '*', };

    if (ctx.request.method !== 'OPTIONS') {
        ctx.response.set({ ...headers });
        try {
            return await next();
        } catch (e) {
            e.headers = { ...e.headers, ...headers };
            throw e;
        }
    }

    if (ctx.request.get('Access-Control-Request-Method')) {
        ctx.response.set({
            ...headers,
            'Access-Control-Allow-Methods': 'GET, POST, PUD, DELETE, PATCH',
        });

        if (ctx.request.get('Access-Control-Request-Headers')) {
            ctx.response.set('Access-Control-Allow-Headers', ctx.request.get('Access-Control-Request-Headers'));
        }

        ctx.response.status = 204;
    }
});

const router = new Router();

const goalEvent = {
    type: 'goal',
    text: 'Отличный удар! И Г-О-Л!',
};

const freekickEvent = {
    type: 'freekick',
    text: 'Нарушение правил, будет штрафной удар',
};

const actionEvent = {
    type: 'action',
    text: 'Идёт перемещение мяча по полю, игроки и той, и другой команды активно пытаются атаковать',
};
const goalList = new Array(5).fill(goalEvent);
const freekickList = new Array(20).fill(freekickEvent);
const actionList = new Array(25).fill(actionEvent);
const eventsList = [...goalList, ...freekickList, ...actionList];
const cache = [];
let isEnd = false;

router.get('/sse', async (ctx) => {
    streamEvents(ctx.req, ctx.res, {
        async fetch(lastEventId) {
            return [];
        },
        
        stream(sse) {
            if (cache.length) {
                sse.sendEvent({
                    id: uuid.v4(),
                    data: JSON.stringify(cache),
                    event: 'getcache',
                });
            } else {
                const startEvent = { type: 'start', text: 'Матч начался', time: +new Date() };
                cache.push(startEvent);
                sse.sendEvent({
                    id: uuid.v4(),
                    data: JSON.stringify(startEvent),
                    event: 'start',
                });
            }

            const interval = setInterval(() => {
                if (!eventsList.length && !isEnd) {
                    isEnd = true;
                    const endEvent = { type: 'end', text: 'Конец матча', time: +new Date() };
                    cache.push(endEvent);
                    clearInterval(interval);
                    sse.sendEvent({
                        id: uuid.v4(),
                        data: JSON.stringify(endEvent),
                        event: 'end',
                    });
                    return () => clearInterval(interval);
                }

                if (isEnd) {
                    sse.sendEvent({
                        event: 'end',
                    });
                    return () => clearInterval(interval);
                }

                const randIndex = Math.floor(Math.random() * eventsList.length);
                const [ randEvent ] = eventsList.splice(randIndex, 1);
                const data = { ...randEvent, time: +new Date() };
                cache.push(data);
                sse.sendEvent({
                    id: uuid.v4(),
                    data: JSON.stringify(data),
                    event: randEvent.type,
                });
            }, 1000);

            return () => clearInterval(interval);
        }
    });

    ctx.respond = false; // koa не будет обрабатывать ответ
});

router.get('/index', async (ctx) => {
    ctx.response.body = 'hello';
});

app.use(router.routes()).use(router.allowedMethods());

const port = process.env.PORT || 7070;
const server = http.createServer(app.callback())
server.listen(port);