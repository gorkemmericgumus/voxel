const path = require('path');
let app, BrowserWindow;
try {
  const electron = require('electron');
  app = electron.app;
  BrowserWindow = electron.BrowserWindow;
} catch (e) {}
if (!app || !BrowserWindow) {
  console.error('');
  console.error('Electron failed to load. Try:');
  console.error('  1. Open a system terminal in the project folder');
  console.error('  2. Run:  cd "' + __dirname + '"  &&  npm start');
  console.error('  or:  npx electron .');
  console.error('');
  process.exit(1);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'Voxel',
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const indexPath = path.join(__dirname, 'index.html');
  win.loadFile(indexPath);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
