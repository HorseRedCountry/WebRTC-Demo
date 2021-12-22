const express = require('express');
const app=express(); 
app.get('/', function(req, res){
    res.sendFile('client.html',{root:__dirname});
});
const server = require('http').createServer(app);
const io=require('socket.io')(server);
io.on('connection', function(socket){
    socket.send('欢迎登录');
    socket.on('message', function(data){
        console.log(data);
    })
});
server.listen(80);