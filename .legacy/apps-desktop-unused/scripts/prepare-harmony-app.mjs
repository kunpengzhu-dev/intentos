import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../../..');
const desktopDir = path.resolve(workspaceRoot, 'apps/desktop');
const serverDir = path.resolve(workspaceRoot, 'apps/server');
const webDir = path.resolve(workspaceRoot, 'apps/web');
const serverDeployDir = path.resolve(workspaceRoot, '.tmp-server-deploy');

const targetArg = process.argv[2];
const outputAppDir = targetArg
  ? path.resolve(process.cwd(), targetArg)
  : path.resolve(desktopDir, 'dist/harmony/app');

const requiredPaths = [
  { label: 'desktop source', filePath: path.resolve(desktopDir, 'src/main.mjs') },
  { label: 'desktop preload', filePath: path.resolve(desktopDir, 'src/preload.mjs') },
  { label: 'web build', filePath: path.resolve(webDir, 'dist/index.html') },
  { label: 'server build', filePath: path.resolve(serverDir, 'dist/index.js') },
];

function collectNativeAddonFiles(rootDir) {
  const results = [];

  if (!existsSync(rootDir)) {
    return results;
  }

  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (fullPath.endsWith('.node')) {
        results.push(fullPath);
      }
    }
  };

  walk(rootDir);
  return results;
}

function collectSymlinkFiles(rootDir) {
  const results = [];

  if (!existsSync(rootDir)) {
    return results;
  }

  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stats = lstatSync(fullPath);
      if (stats.isSymbolicLink()) {
        results.push(fullPath);
        continue;
      }
      if (stats.isDirectory()) {
        walk(fullPath);
      }
    }
  };

  walk(rootDir);
  return results;
}

function copyNodeModulesWithoutSymlinks(sourceDir, targetDir) {
  rmSync(targetDir, { recursive: true, force: true });

  if (process.platform === 'win32') {
    cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
  } else {
    execFileSync('cp', ['-RL', sourceDir, targetDir], { stdio: 'inherit' });
  }

  const symlinks = collectSymlinkFiles(targetDir);
  if (symlinks.length > 0) {
    const sample = symlinks.slice(0, 5).map((fullPath) => `- ${path.relative(targetDir, fullPath)}`).join('\n');
    throw new Error(`Symbolic links are not allowed in packaged server/node_modules.\n${sample}`);
  }
}

function pruneWorkspaceSelfPackage(nodeModulesDir) {
  const selfPkgDir = path.resolve(nodeModulesDir, '@intentos/server');
  rmSync(selfPkgDir, { recursive: true, force: true });
}

function deployServerPackage(targetDir) {
  rmSync(targetDir, { recursive: true, force: true });

  const storeDir = process.env.PNPM_STORE_DIR ?? path.resolve(homedir(), '.local/share/pnpm/store/v3');
  const commonArgs = ['--store-dir', storeDir, '--filter', '@intentos/server', 'deploy', '--prod'];
  const run = (offline) => {
    const args = offline ? [...commonArgs, '--offline', targetDir] : [...commonArgs, targetDir];
    execFileSync('pnpm', args, {
      cwd: workspaceRoot,
      stdio: 'inherit',
    });
  };

  try {
    run(true);
  } catch {
    console.warn('Offline server deploy failed. Retrying with network...');
    rmSync(targetDir, { recursive: true, force: true });
    run(false);
  }
}

for (const { label, filePath } of requiredPaths) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

rmSync(outputAppDir, { recursive: true, force: true });
mkdirSync(outputAppDir, { recursive: true });

deployServerPackage(serverDeployDir);

try {
  const deployedServerPaths = [
    { label: 'deployed server build', filePath: path.resolve(serverDeployDir, 'dist/index.js') },
    { label: 'deployed server dependencies', filePath: path.resolve(serverDeployDir, 'node_modules') },
    { label: 'deployed server package', filePath: path.resolve(serverDeployDir, 'package.json') },
  ];
  for (const { label, filePath } of deployedServerPaths) {
    if (!existsSync(filePath)) {
      throw new Error(`Missing ${label}: ${filePath}`);
    }
  }

  cpSync(path.resolve(desktopDir, 'src'), path.resolve(outputAppDir, 'src'), { recursive: true });
  cpSync(path.resolve(webDir, 'dist'), path.resolve(outputAppDir, 'web/dist'), { recursive: true });
  cpSync(path.resolve(serverDeployDir, 'dist'), path.resolve(outputAppDir, 'server/dist'), { recursive: true });
  if (existsSync(path.resolve(serverDeployDir, 'scripts'))) {
    cpSync(path.resolve(serverDeployDir, 'scripts'), path.resolve(outputAppDir, 'server/scripts'), { recursive: true });
  }
  copyNodeModulesWithoutSymlinks(
    path.resolve(serverDeployDir, 'node_modules'),
    path.resolve(outputAppDir, 'server/node_modules'),
  );
  pruneWorkspaceSelfPackage(path.resolve(outputAppDir, 'server/node_modules'));
  cpSync(path.resolve(serverDeployDir, 'package.json'), path.resolve(outputAppDir, 'server/package.json'));
} finally {
  rmSync(serverDeployDir, { recursive: true, force: true });
}

const desktopPackageRaw = readFileSync(path.resolve(desktopDir, 'package.json'), 'utf8');
const desktopPackage = JSON.parse(desktopPackageRaw);
const harmonyAppPackage = {
  name: `${desktopPackage.name}-harmony-runtime`,
  private: true,
  type: 'module',
  main: 'src/main.mjs',
};

writeFileSync(path.resolve(outputAppDir, 'package.json'), `${JSON.stringify(harmonyAppPackage, null, 2)}\n`);

const nativeAddonFiles = collectNativeAddonFiles(path.resolve(outputAppDir, 'server/node_modules'));
if (nativeAddonFiles.length > 0) {
  console.warn('WARNING: native Node addons detected in packaged app:');
  for (const fullPath of nativeAddonFiles) {
    console.warn(`- ${path.relative(outputAppDir, fullPath)}`);
  }
  console.warn('Rebuild these addons for HarmonyOS Electron target ABI/architecture before deploying to real devices.');
  console.warn('');
}

console.log('Harmony app resources prepared.');
console.log(`Output: ${outputAppDir}`);
console.log('');
console.log('Next step: copy this folder into your Harmony project at');
console.log('web_engine/src/main/resources/resfile/resources/app');
