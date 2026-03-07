const { execSync } = require('child_process');
const { cpSync, mkdirSync, rmSync } = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const buildDir = path.join(__dirname, 'build');

// Clean
rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

// Build editor
console.log('Building editor...');
execSync('npm install && npm run build', {
  cwd: path.join(root, 'editor'),
  stdio: 'inherit',
});
cpSync(path.join(root, 'editor', 'dist'), path.join(buildDir, 'editor'), { recursive: true });

// Build client
console.log('Building client...');
execSync('npm install && npm run build', {
  cwd: path.join(root, 'client'),
  stdio: 'inherit',
});
cpSync(path.join(root, 'client', 'dist'), path.join(buildDir, 'client'), { recursive: true });

// Copy launcher
cpSync(path.join(__dirname, 'launcher'), path.join(buildDir, 'launcher'), { recursive: true });

console.log('Build complete! Output in desktop/build/');
