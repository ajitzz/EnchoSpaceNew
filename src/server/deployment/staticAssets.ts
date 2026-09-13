import express from 'express';
import {resolve} from 'node:path';
import {isPrivatePublicPath,verifyPublicBuild} from './publicArtifacts.js';
export {isPrivatePublicPath,verifyPublicBuild} from './publicArtifacts.js';
export function createPublicAssetsMiddleware(directory:string){
 verifyPublicBuild(directory);const router=express.Router();
 router.use((req,res,next)=>{let path:string;try{path=decodeURIComponent(req.path);}catch{return res.sendStatus(400);}if(isPrivatePublicPath(path))return res.sendStatus(404);next();});
 router.use(express.static(resolve(directory),{dotfiles:'deny',fallthrough:true}));return router;
}
