'use strict';
const {DatabaseSync}=require('node:sqlite');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');const path=require('node:path');
const {types,validate,fail}=require('./content.cjs');
class Store {
 constructor(directory){
  fs.mkdirSync(directory,{recursive:true});this.db=new DatabaseSync(path.join(directory,'portfolio.sqlite'),{timeout:5000});
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
   CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
   CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,type TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('draft','published')),display_order INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
   CREATE INDEX IF NOT EXISTS items_listing ON items(type,status,display_order);
   CREATE UNIQUE INDEX IF NOT EXISTS project_slug ON items(json_extract(payload,'$.slug')) WHERE type='projects';
   CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS admin(id INTEGER PRIMARY KEY CHECK(id=1),username TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS login_attempts(ip TEXT PRIMARY KEY,count INTEGER NOT NULL,reset INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS media(path TEXT PRIMARY KEY,mime TEXT NOT NULL,bytes INTEGER NOT NULL,created_at TEXT NOT NULL);
  `);
  if(!this.db.prepare('SELECT 1 FROM migrations WHERE version=1').get()){
   const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'seed.json'),'utf8'));
   this.transaction(()=>{for(const type of Object.keys(types))for(const item of seed[type])this.create(type,item);this.db.prepare('INSERT INTO settings VALUES (?,?)').run('site',JSON.stringify(seed.site));this.db.prepare('INSERT INTO migrations VALUES (1)').run();});
  }
 }
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 decode(row){if(!row)return null;return {...JSON.parse(row.payload),id:row.id,status:row.status,display_order:row.display_order,created_at:row.created_at,updated_at:row.updated_at,version:row.version};}
 list(type,published=false){return this.db.prepare(`SELECT * FROM items WHERE type=? ${published?"AND status='published'":''} ORDER BY display_order,id`).all(type).map(r=>this.decode(r));}
 get(type,id){const item=this.decode(this.db.prepare('SELECT * FROM items WHERE type=? AND id=?').get(type,id));if(!item)fail('Item not found.',404);return item;}
 create(type,input){const {status,...payload}=validate(type,input);const id=randomUUID();const now=new Date().toISOString();const order=Number(this.db.prepare('SELECT COALESCE(MAX(display_order),-1)+1 AS n FROM items WHERE type=?').get(type).n);try{this.db.prepare('INSERT INTO items VALUES (?,?,?,?,?,?,?,1)').run(id,type,status,order,JSON.stringify(payload),now,now);}catch(e){if(e.code?.includes('CONSTRAINT')||e.message.includes('UNIQUE'))fail('This project slug is already in use.',409);throw e;}return this.get(type,id);}
 update(type,id,input){const previous=this.get(type,id);if(input.version!==previous.version)fail('This item changed in another tab. Reload it before saving.',409);const {status,...payload}=validate(type,input);try{const result=this.db.prepare('UPDATE items SET status=?,payload=?,updated_at=?,version=version+1 WHERE id=? AND version=?').run(status,JSON.stringify(payload),new Date().toISOString(),id,input.version);if(!result.changes)fail('Item changed. Reload before saving.',409);}catch(e){if(e.message.includes('UNIQUE'))fail('This project slug is already in use.',409);throw e;}return this.get(type,id);}
 remove(type,id,version){const old=this.get(type,id);if(old.version!==version)fail('This item changed. Reload before deleting.',409);this.db.prepare('DELETE FROM items WHERE id=? AND version=?').run(id,version);}
 reorder(type,entries){const items=this.list(type);if(!Array.isArray(entries)||entries.length!==items.length||new Set(entries.map(x=>x.id)).size!==items.length)fail('Provide every item exactly once.');const byId=new Map(items.map(i=>[i.id,i]));for(const e of entries)if(!byId.has(e.id)||e.version!==byId.get(e.id).version)fail('Order changed. Reload before reordering.',409);this.transaction(()=>{entries.forEach((e,i)=>this.db.prepare('UPDATE items SET display_order=?,version=version+1,updated_at=? WHERE id=?').run(i,new Date().toISOString(),e.id));});return this.list(type);}
 site(){return JSON.parse(this.db.prepare("SELECT value FROM settings WHERE key='site'").get().value);}
 close(){this.db.close();}
}
module.exports={Store};
