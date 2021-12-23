//设置当前进程标题
process.title = 'webrtc-full-demo';

//文件读取
import * as fs from 'fs';
//HTTPS相关功能
import * as https from 'https';
//web框架
import express from 'express';
import { Room } from './lib/Room';
import { Peer } from './lib/Peer';
//将websock和Ajax等通信方式封装成统一的通信接口
import * as socketio from 'socket.io';
//通过解析参数来帮助创建脚手架的工具
import * as yargs from 'yargs';
//日志工具
import { connectLogger, getLogger, configure } from 'log4js';
//配置日志
configure('./log4js.json');
const logger = getLogger('Server');
//用于设置HTTP头
const helmet = require('helmet');
//即Cross-origin resource sharing，跨域资源共享
const cors = require('cors');
//一个express内置的HTTP请求体解析的中间件，使用这个模块可以解析JSON、Raw、文本、URL-encoded格式的请求体
const bodyParser = require('body-parser');
//用于开启gzip压缩
const compression = require('compression');

//SSL证书
yargs.usage('Usage: $0 --cert [file] --key [file]')
	.version('signaling-server 1.0')
	.demandOption(['cert', 'key'])
	.option('cert', { describe: 'ssl certificate file' })
	.option('key', { describe: 'ssl certificate key file' });

const certfile = yargs.argv.cert as string;
const keyfile = yargs.argv.key as string;

[certfile, keyfile].forEach(file => {
	if (!fs.existsSync(file)) {
		logger.error('%s do not exist!', file);
		process.exit(-1);
	}
});

const tls = {
	cert: fs.readFileSync(certfile),
	key: fs.readFileSync(keyfile),
};

const app = express();
app.use(compression());

app.use(connectLogger(getLogger('http'), { level: 'auto' }));

//设置资源相关
app.use(helmet.hsts());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

//设置字面量对象
const rooms = new Map<string, Room>();
app.locals.rooms = rooms;

//定义类型
let httpsServer: https.Server;
let io: socketio.Server;

async function run() {
	await runHttpsServer();
	await runWebSocketServer();
	//重复调用方法
	setInterval(() => {
		let all = 0;
		let closed = 0;

		rooms.forEach(room => {
			all++;
			if (room.closed) {
				closed++;
			}
			logger.debug(JSON.stringify(room.statusReport()));
		});

		logger.info('room total: %s, closed: %s', all, closed);
	}, 30000);

	// check for deserted rooms
	setInterval(() => {
		rooms.forEach(room => room.checkDeserted());
	}, 10000);
}

const runHttpsServer = () => {
	app.use('/', express.static('web', {
		maxAge: '-1'
	}));

	app.get('*', (req, res, next) => {
		res.status(404).send({ res: '404' });
	});

	httpsServer = https.createServer(tls, app);
	httpsServer.listen(443, () => {
		logger.info(`Listening at 443...`);
	});
}

const runWebSocketServer = async () => {
	io = socketio.listen(httpsServer, {
		pingTimeout: 3000,
		pingInterval: 5000,
	});

	logger.info("Running socketio server....");

	io.on('connection', async (socket) => {
		const { roomId, peerId } = socket.handshake.query;

		if (!roomId || !peerId) {
			logger.warn('connection request without roomId and/or peerId');
			socket.disconnect(true);
			return;
		}

		logger.info('connection request [roomId:"%s", peerId:"%s"]', roomId, peerId);

		try {
			const room = await getOrCreateRoom(roomId);
			let peer = room.getPeer(peerId);

			if (!peer) {
				peer = new Peer(peerId, socket, room);
				room.handlePeer(peer);
				logger.info('new peer, %s, %s', peerId, socket.id);
			} else {
				peer.handlePeerReconnect(socket);
				logger.info('peer reconnect, %s, %s', peerId, socket.id);
			}
		} catch (error) {
			logger.error('room creation or room joining failed [error:"%o"]', error);
			socket.disconnect(true);
			return;
		};
	});
}

const getOrCreateRoom = async (roomId: string) => {
	let room = rooms.get(roomId);

	if (!room) {
		logger.info('creating a new Room [roomId:"%s"]', roomId);


		room = await Room.create(roomId);

		rooms.set(roomId, room);
		room.on('close', () => rooms.delete(roomId));
	}

	return room;
}

run();
