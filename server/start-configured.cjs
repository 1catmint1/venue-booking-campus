'use strict';
// Explicit server configuration only. No system credential discovery or provider auto-enrolment.
const fs=require('node:fs');const {createServer}=require('./server.cjs');
const configPath=process.env.VENUE_CONFIG_FILE;if(!configPath)throw new Error('Set VENUE_CONFIG_FILE to a server-only configuration file. Default local demo: node server/server.cjs');
const config=JSON.parse(fs.readFileSync(configPath,'utf8')),wx=config.wechat||{},model=config.model||{};
const secret=name=>name?process.env[name]||'':'';
const app=createServer({port:config.port||18843,demo:config.mode==='local-demo',publicOrigin:config.publicOrigin,
 wechatConfig:wx.enabled?{appId:wx.appId,callback:wx.callback,secret:secret(wx.secretEnv),identitySecret:secret(wx.identitySecretEnv)}:{},
 modelConfig:model.enabled?{...model,key:secret(model.keyEnv)||model.key}:{} });
app.server.listen({port:config.port||18843,host:'127.0.0.1',backlog:16384},()=>console.log('Server listening on loopback; provider configuration values are not logged.'));
process.once('SIGINT',()=>app.server.close());process.once('SIGTERM',()=>app.server.close());
