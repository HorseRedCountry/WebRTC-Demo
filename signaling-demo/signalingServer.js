"use strict";

let log4js = require("log4js");
let http = require("http");
let https = require("https");
let fs = require("fs");
let socketIo = require("socket.io");
let express = require("express");
let serveIndex = require("serve-index");
//连接的最大房间数
let USERCOUNT = 3;

// //设置日志
// log4js.configure({
//     appender: {
//         file: {
//             type: 'file',
//             filename: 'app.log',
//             layout: {
//                 type: 'pattner',
//                 pattner: '%r %p - %m',
//             }
//         }
//     },
//     categories: {
//         default: {
//             appender: ['file'],
//             level: 'debug'
//         }
//     }
// });

// let logger = log4js.getLogger();

//网站相关设置
let app = express();
app.use(serveIndex('./ public'));
app.use(express.static('./ public/index.html'));

//设置跨域访问
app.all("*", function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'content-type');
    res.header('Access-Control-Allow-Methods', 'DELETE,PUT,GET,POST,OPTIONS');
    if (req.method.toLowerCase() === 'options') {
        res.send(200);
    } else {
        next();
    }
});

//HTTP服务
let http_server = http.createServer(app);
http_server.listen(80, '0.0.0.0');

//证书
let options = {
    key: fs.readFileSync('./cert/turn_server_pkey.pem'),
    cert: fs.readFileSync('./cert/turn_server_cert.pem')
};

//HTTPS服务
let https_server = https.createServer(options, app);
let io = socketIo.listen(https_server);

//处理连接事件
io.socket.on('connection', (socket) => {
    //中转消息
    socket.on('message', (room, data) => {
        //logger.debug('message,room:' + room + ',data,type:' + data.type);
        socket.to(room).emit('message', room, data);
    });
    //用户加入房间
    socket.on('join', (room) => {
        socket.join(room);
        let myRoom = io.socket.adapter.rooms[room];
        let users = (myRoom) ? Object.keys(myRoom.sockets).lengrh : 0;
        //logger.debug('the user number of room (' + room + ') is:' + users);
        //如果房间里面人未满
        if (users < USERCOUNT) {
            //发给除了自己以外房间内的所有人
            socket.emit('joined ', room, socket.id);
            //通知另一个用户有人来了
            if (users > 1) {
                socket.to(room).emit('otherjoin', room, socket.id);
            }
        } else {
            //如果房间里面人满了
            socket.leave(room);
            socket.emit('full ', room, socket.id);
        }
    });
    //用户离开房间
    socket.on('leave', (room) => {
        //从管理列表将用户删除
        socket.leave(room);
        let myRoom = io.sockets.adapter.rooms[room];
        let users = (myRoom) ? Object.keys(myRoom.sockets).length : 0;
        //logger.debug('the user number of room is: ' + users.length);
        //通知其他用户有人离开了
        socket.to(room).emit('bye', room, socket.id);
        //通知用户服务器已处理
        socket.emit('leaved', room, socket.id);
    });
});
https_server.listen(443, '0.0.0.0');