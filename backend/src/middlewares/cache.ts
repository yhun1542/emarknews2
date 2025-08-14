import type { Request, Response, NextFunction } from 'express';
const mem = new Map<string, { at:number; body:any }>();
export function cache(seconds=120){
  return (req:Request,res:Response,next:NextFunction)=>{
    const key = req.originalUrl;
    const hit = mem.get(key);
    const now = Date.now();
    if(hit && now - hit.at < seconds*1000){
      res.setHeader('X-Cache', 'HIT'); return res.json(hit.body);
    }
    const json = res.json.bind(res);
    res.json = (body:any) => { mem.set(key, { at: Date.now(), body }); return json(body); };
    next();
  };
}