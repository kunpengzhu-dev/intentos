import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../../..');
const desktopDir = path.resolve(workspaceRoot, 'apps/desktop');
const serverDir = path.resolve(workspaceRoot, 'apps/server');
const webDir = path.resolve(workspaceRoot, 'apps/web');

const targetArg = process.argv[2];
const outputAppDir = targetArg
  ? path.resolve(process.cwd(), targetArg)
  : path.resolve(desktopDir, 'dist/harmony/app');

const requiredPaths = [
  { label: 'desktop source', filePath: path.resolve(desktopDir, 'src/main.mjs') },
  { label: 'desktop preload', filePath: path.resolve(desktopDir, 'src/preload.mjs') },
  { label: 'web build', filePath: path.resolve(webDir, 'dist/index.html') },
  { label: 'server build', filePath: path.resolve(serverDir, 'dist/index.js') },
  { label: 'server dependencies', filePath: path.resolve(serverDir, 'node_modules') },
];

for (const { label, filePath } of requiredPaths) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

rmSync(outputAppDir, { recursive: true, force: true });
mkdirSync(outputAppDir, { recursive: true });

cpSync(path.resolve(desktopDir, 'src'), path.resolve(outputAppDir, 'src'), { recursive: true });
cpSync(path.resolve(webDir, 'dist'), path.resolve(outputAppDir, 'web/dist'), { recursive: true });
cpSync(path.resolve(serverDir, 'dist'), path.resolve(outputAppDir, 'server/dist'), { recursive: true });
cpSync(path.resolve(serverDir, 'scripts'), path.resolve(outputAppDir, 'server/scripts'), { recursive: true });
cpSync(path.resolve(serverDir, 'node_modules'), path.resolve(outputAppDir, 'server/node_modules'), {
  recursive: true,
  dereference: true,
});
cpSync(path.resolve(serverDir, 'package.json'), path.resolve(outputAppDir, 'server/package.json'));

const desktopPackageRaw = readFileSync(path.resolve(desktopDir, 'package.json'), 'utf8');
const desktopPackage = JSON.parse(desktopPackageRaw);
const harmonyAppPackage = {
  name: `${desktopPackage.name}-harmony-runtime`,
  private: true,
  type: 'module',
  main: 'src/main.mjs',
};

writeFileSync(path.resolve(outputAppDir, 'package.json'), `${JSON.stringify(harmonyAppPackage, null, 2)}\n`);

console.log('Harmony app resources prepared.');
console.log(`Output: ${outputAppDir}`);
console.log('');
console.log('Next step: copy this folder into your Harmony project at');
console.log('web_engine/src/main/resources/resfile/resources/app');
