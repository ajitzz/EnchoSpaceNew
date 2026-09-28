#!/usr/bin/env node
/** Structural containment, not semantic certification. Never imports application code. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

export const retiredPrototypes=[
  'src/lib/platform/crossDomainCommandEngine.ts',
  'src/lib/compliance/pausedCanaryHardeningEngine.ts',
  'src/lib/compliance/stagingHardeningEngine.ts',
  'src/lib/compliance/adTechSettlementHardeningEngine.ts',
  'src/lib/compliance/boundedPilotHardeningEngine.ts',
  'src/lib/compliance/providerSecurityHardeningEngine.ts',
  'src/lib/marketing/portfolioEngine.ts',
  'src/lib/marketing/creativePackageEngine.ts',
  'src/lib/marketing/providerPackageEngine.ts',
];
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sourceFiles=directory=>fs.existsSync(directory)?fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>
  entry.isDirectory()?sourceFiles(path.join(directory,entry.name)):/\.(?:ts|tsx|mts|js|mjs)$/.test(entry.name)?[path.join(directory,entry.name)]:[]):[];

export function verifyProductionBoundaries({directory=root,entries,retired=retiredPrototypes}={}){
  const retiredPaths=new Set(retired.map(file=>path.resolve(directory,file)));
  const roots=entries??['server.ts','App.tsx','index.tsx',...['src/server','src/workers','api','scripts/deployment'].flatMap(folder=>
    sourceFiles(path.join(directory,folder)).map(file=>path.relative(directory,file)))];
  const options={moduleResolution:ts.ModuleResolutionKind.Bundler,baseUrl:directory,paths:{'@/*':['./*']},allowJs:true};
  const queue=roots.filter(file=>fs.existsSync(path.resolve(directory,file))).map(file=>({file:path.resolve(directory,file),chain:[file]}));
  const visited=new Set();const violations=[];
  while(queue.length){
    const {file,chain}=queue.shift();
    if(retiredPaths.has(file)){violations.push(chain);continue;}
    if(visited.has(file))continue;
    visited.add(file);
    const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
    const specifiers=[];
    const visit=node=>{
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteralLike(node.moduleSpecifier))specifiers.push(node.moduleSpecifier.text);
      if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword
        ||ts.isIdentifier(node.expression)&&node.expression.text==='require')){
        const argument=node.arguments[0];
        if(argument&&ts.isStringLiteralLike(argument))specifiers.push(argument.text);
        // Computed imports require separate review; this scanner does not claim
        // they are resolved or safe merely because their targets are unknown.
      }
      ts.forEachChild(node,visit);
    };
    visit(source);
    for(const specifier of specifiers){
      const result=ts.resolveModuleName(specifier,file,options,ts.sys).resolvedModule;
      if(!result||result.isExternalLibraryImport)continue;
      const resolved=path.resolve(result.resolvedFileName);
      if(!resolved.startsWith(directory+path.sep))continue;
      queue.push({file:resolved,chain:[...chain,path.relative(directory,resolved)]});
    }
  }
  return {valid:violations.length===0,visited:visited.size,retiredModules:retired.length,violations,
    scope:'literal static/re-export/dynamic import graph only; computed runtime loading remains unverified'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=verifyProductionBoundaries();console.log(JSON.stringify(result));if(!result.valid)process.exitCode=1;
}
