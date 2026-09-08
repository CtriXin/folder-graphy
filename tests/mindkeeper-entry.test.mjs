import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

// Real compiled module + real Node subprocess. Only the two CLI bodies are
// sentinels, so an incorrect package/project path is directly observable.
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'map-entry-'));
  const pkg = join(dir, 'installed map');
  const repo = join(dir, 'target project');
  mkdirSync(repo, {recursive:true});
  cpSync(resolve('dist'), join(pkg, 'dist'), {recursive:true});
  writeFileSync(join(pkg, 'package.json'), '{"type":"module"}');
  writeFileSync(join(repo, 'package.json'), '{}');
  mkdirSync(join(repo, 'dist/cli'), {recursive:true});
  const own = join(dir, 'own.json');
  const foreign = join(dir, 'foreign');
  writeFileSync(join(pkg, 'dist/cli/map.js'), `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(own)},JSON.stringify(process.argv.slice(2)));`);
  writeFileSync(join(repo, 'dist/cli/map.js'), `require('node:fs').writeFileSync(${JSON.stringify(foreign)},'executed');`);
  return {dir,pkg,repo,own,foreign};
}
function run(f, module='mindkeeper.js', config={silent:true}) {
  const source = `import {triggerMap} from ${JSON.stringify('file://'+join(f.pkg,'dist/integrations',module))}; console.log(JSON.stringify(await triggerMap(${JSON.stringify(f.repo)},${JSON.stringify(config)})));`;
  return spawnSync(process.execPath, ['--input-type=module','-e',source], {cwd:f.repo,encoding:'utf8',timeout:5000});
}
test('explicit integration invokes its installed CLI, never project dist/cli/map.js', () => {
  const f=fixture();
  try {
    const result=run(f);
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout.trim(),'true');
    assert.deepEqual(JSON.parse(readFileSync(f.own)),[f.repo]);
    assert.equal(existsSync(f.foreign),false);
  } finally {rmSync(f.dir,{recursive:true,force:true});}
});
test('historical path negative control actually executes foreign sentinel', () => {
  const f=fixture();
  try {
    const path=join(f.pkg,'dist/integrations/mindkeeper.js');
    const original=readFileSync(path,'utf8');
    const broken=original.replace('const mapCli = fileURLToPath(new URL("../cli/map.js", import.meta.url));', 'const mapCli = root + "/dist/cli/map.js";');
    assert.notEqual(broken,original);
    writeFileSync(join(f.pkg,'dist/integrations/historical.js'),broken);
    assert.equal(run(f,'historical.js').status,0);
    assert.equal(existsSync(f.foreign),true);
    assert.equal(existsSync(f.own),false);
  } finally {rmSync(f.dir,{recursive:true,force:true});}
});
test('explicit disabled integration and old SessionStart entry do no work', () => {
  const f=fixture();
  try {
    assert.equal(run(f,'mindkeeper.js',{enabled:false}).stdout.trim(),'false');
    const hook=spawnSync(process.execPath,[join(f.pkg,'dist/hooks/session-start.js')],{cwd:f.repo,encoding:'utf8',timeout:1000});
    assert.equal(hook.status,0,hook.stderr);
    assert.equal(hook.stdout,'');
    assert.equal(existsSync(f.own),false);
    assert.equal(existsSync(f.foreign),false);
    assert.equal(existsSync(join(f.repo,'.ai')),false);
  } finally {rmSync(f.dir,{recursive:true,force:true});}
});
