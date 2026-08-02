/* ══════════════════════════════════════════════════════════════════
   RED FOREST FX — AUTH, CONFIG & BACKUP SYSTEM
   Replaces all hardcoded secrets with per-user localStorage config.
   Provides login gate, setup wizard, and full backup/restore.
   ══════════════════════════════════════════════════════════════════ */

(function() {
'use strict';

// ══════════════════════════════════════════════════════════════════
// LOCALSTORAGE KEYS (for backup)
// ══════════════════════════════════════════════════════════════════

var BACKUP_KEYS = [
  'rfxUserConfigs',     // all user configs
  'rfxCurrentUser',     // last logged in user
  'journalEntries',
  'trades',
  'rfxAlerts',
  'rfxBookmarks',
  'rfxBoostState',
  'rfxWeeklyReviews',
  'rfxSound',
  'rfxVoice',
  'rfxTheme',
  'rfxGeminiKey',
  'rfxIgnoredOandaIds',
  'rfxLastOandaTradeId',
  'rfxLastSyncedOandaId'
];

// ══════════════════════════════════════════════════════════════════
// CONFIG READER — replaces all hardcoded secrets
// ══════════════════════════════════════════════════════════════════

window.RFX_CONFIG = {
  get oandaToken() {
    var configs = JSON.parse(localStorage.getItem('rfxUserConfigs') || '{}');
    var current = localStorage.getItem('rfxCurrentUser') || '';
    return (configs[current] && configs[current].oandaToken) || '';
  },
  get oandaAccount() {
    var configs = JSON.parse(localStorage.getItem('rfxUserConfigs') || '{}');
    var current = localStorage.getItem('rfxCurrentUser') || '';
    return (configs[current] && configs[current].oandaAccount) || '';
  },
  get oandaBase() { return 'https://api-fxpractice.oanda.com/v3'; },
  get oandaStream() { return 'https://stream-fxpractice.oanda.com/v3'; },
  get openRouterKey() {
    var configs = JSON.parse(localStorage.getItem('rfxUserConfigs') || '{}');
    var current = localStorage.getItem('rfxCurrentUser') || '';
    return (configs[current] && configs[current].openRouterKey) || '';
  },
  get telegramBotToken() {
    var configs = JSON.parse(localStorage.getItem('rfxUserConfigs') || '{}');
    var current = localStorage.getItem('rfxCurrentUser') || '';
    return (configs[current] && configs[current].telegramBotToken) || '';
  },
  get telegramChatId() {
    var configs = JSON.parse(localStorage.getItem('rfxUserConfigs') || '{}');
    var current = localStorage.getItem('rfxCurrentUser') || '';
    return (configs[current] && configs[current].telegramChatId) || '';
  },
  get n8nWebhook() {
    var configs = JSON.parse(localStorage.getItem('rfxUserConfigs') || '{}');
    var current = localStorage.getItem('rfxCurrentUser') || '';
    return (configs[current] && configs[current].n8nWebhook) || '';
  },
  get currentUser() {
    return localStorage.getItem('rfxCurrentUser') || '';
  },
  get isLoggedIn() {
    var current = localStorage.getItem('rfxCurrentUser') || '';
    var configs = JSON.parse(localStorage.getItem('rfxUserConfigs') || '{}');
    return !!(current && configs[current] && configs[current].oandaToken);
  }
};

// ══════════════════════════════════════════════════════════════════
// SETUP WIZARD HTML
// ══════════════════════════════════════════════════════════════════

function injectSetupHTML() {
  var html = '<div id="rfxSetupOverlay" style="position:fixed;inset:0;background:#000;z-index:99999;' +
    'display:flex;align-items:center;justify-content:center;padding:20px;">' +
    '<div style="background:#0A140A;border:1px solid rgba(2,223,130,0.3);border-radius:16px;' +
    'padding:32px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;">' +

    // Header
    '<div style="text-align:center;margin-bottom:24px;">' +
    '<div style="font-size:28px;margin-bottom:8px;">🌲</div>' +
    '<h2 style="font-size:22px;font-weight:900;color:#fff;margin:0 0 4px;">Red Forest FX</h2>' +
    '<p style="font-size:12px;color:rgba(255,255,255,0.4);margin:0;">Enter your credentials to get started</p>' +
    '</div>' +

    // Username
    '<div style="margin-bottom:16px;">' +
    '<label style="display:block;font-size:11px;font-weight:700;color:rgba(2,223,130,0.8);' +
    'text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Your Name</label>' +
    '<input id="rfxSetupUser" type="text" placeholder="e.g. Keenan" style="width:100%;padding:10px 12px;' +
    'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;' +
    'color:#fff;font-size:14px;box-sizing:border-box;outline:none;" onfocus="this.style.borderColor=\'rgba(2,223,130,0.5)\'" ' +
    'onblur="this.style.borderColor=\'rgba(255,255,255,0.12)\'">' +
    '</div>' +

    // OANDA Token
    '<div style="margin-bottom:16px;">' +
    '<label style="display:block;font-size:11px;font-weight:700;color:rgba(2,223,130,0.8);' +
    'text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">OANDA API Token *</label>' +
    '<input id="rfxSetupOandaToken" type="password" placeholder="Your OANDA practice token" style="width:100%;' +
    'padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);' +
    'border-radius:8px;color:#fff;font-size:13px;font-family:monospace;box-sizing:border-box;outline:none;" ' +
    'onfocus="this.style.borderColor=\'rgba(2,223,130,0.5)\'" onblur="this.style.borderColor=\'rgba(255,255,255,0.12)\'">' +
    '</div>' +

    // OANDA Account
    '<div style="margin-bottom:16px;">' +
    '<label style="display:block;font-size:11px;font-weight:700;color:rgba(2,223,130,0.8);' +
    'text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">OANDA Account ID *</label>' +
    '<input id="rfxSetupOandaAcct" type="text" placeholder="e.g. 101-001-38916320-001" style="width:100%;' +
    'padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);' +
    'border-radius:8px;color:#fff;font-size:13px;font-family:monospace;box-sizing:border-box;outline:none;" ' +
    'onfocus="this.style.borderColor=\'rgba(2,223,130,0.5)\'" onblur="this.style.borderColor=\'rgba(255,255,255,0.12)\'">' +
    '</div>' +

    // OpenRouter (optional)
    '<div style="margin-bottom:16px;">' +
    '<label style="display:block;font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);' +
    'text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">OpenRouter API Key <span style="color:rgba(255,255,255,0.3);font-weight:400;">(optional)</span></label>' +
    '<input id="rfxSetupOpenRouter" type="password" placeholder="sk-or-v1-..." style="width:100%;' +
    'padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);' +
    'border-radius:8px;color:#fff;font-size:13px;font-family:monospace;box-sizing:border-box;outline:none;" ' +
    'onfocus="this.style.borderColor=\'rgba(2,223,130,0.5)\'" onblur="this.style.borderColor=\'rgba(255,255,255,0.12)\'">' +
    '</div>' +

    // Telegram (optional)
    '<div style="margin-bottom:16px;">' +
    '<label style="display:block;font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);' +
    'text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Telegram Bot Token <span style="color:rgba(255,255,255,0.3);font-weight:400;">(optional)</span></label>' +
    '<input id="rfxSetupTgToken" type="password" placeholder="8985327220:AAF..." style="width:100%;' +
    'padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);' +
    'border-radius:8px;color:#fff;font-size:13px;font-family:monospace;box-sizing:border-box;outline:none;" ' +
    'onfocus="this.style.borderColor=\'rgba(2,223,130,0.5)\'" onblur="this.style.borderColor=\'rgba(255,255,255,0.12)\'">' +
    '</div>' +

    '<div style="margin-bottom:16px;">' +
    '<label style="display:block;font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);' +
    'text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Telegram Chat ID <span style="color:rgba(255,255,255,0.3);font-weight:400;">(optional)</span></label>' +
    '<input id="rfxSetupTgChat" type="text" placeholder="e.g. 7024519653" style="width:100%;' +
    'padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);' +
    'border-radius:8px;color:#fff;font-size:13px;font-family:monospace;box-sizing:border-box;outline:none;" ' +
    'onfocus="this.style.borderColor=\'rgba(2,223,130,0.5)\'" onblur="this.style.borderColor=\'rgba(255,255,255,0.12)\'">' +
    '</div>' +

    // n8n (optional)
    '<div style="margin-bottom:24px;">' +
    '<label style="display:block;font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);' +
    'text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">n8n Webhook URL <span style="color:rgba(255,255,255,0.3);font-weight:400;">(optional)</span></label>' +
    '<input id="rfxSetupN8n" type="text" placeholder="https://...n8n.cloud/webhook/..." style="width:100%;' +
    'padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);' +
    'border-radius:8px;color:#fff;font-size:13px;font-family:monospace;box-sizing:border-box;outline:none;" ' +
    'onfocus="this.style.borderColor=\'rgba(2,223,130,0.5)\'" onblur="this.style.borderColor=\'rgba(255,255,255,0.12)\'">' +
    '</div>' +

    // Error
    '<div id="rfxSetupError" style="font-size:12px;color:#FF4D4D;margin-bottom:12px;display:none;"></div>' +

    // Buttons
    '<div style="display:flex;gap:10px;">' +
    '<button id="rfxSetupImportBtn" type="button" style="flex:1;padding:12px;background:transparent;' +
    'border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:rgba(255,255,255,0.6);' +
    'font-size:13px;font-weight:700;cursor:pointer;" onclick="document.getElementById(\'rfxBackupImportFile\').click()">' +
    '📥 Restore Backup</button>' +
    '<button id="rfxSetupSubmit" type="button" style="flex:2;padding:12px;background:#02DF82;' +
    'border:none;border-radius:8px;color:#0A140A;font-size:13px;font-weight:800;cursor:pointer;" ' +
    'onclick="rfxSubmitSetup()">' +
    'Enter Dashboard →</button>' +
    '</div>' +

    '<div style="margin-top:12px;text-align:center;">' +
    '<span style="font-size:10px;color:rgba(255,255,255,0.25);">* Required · All data stored locally in your browser</span>' +
    '</div>' +

    '</div></div>' +
    '<input type="file" id="rfxBackupImportFile" accept=".json" style="display:none;" ' +
    'onchange="rfxHandleImportBackup(this)">';

  document.body.insertAdjacentHTML('beforeend', html);
}

// ══════════════════════════════════════════════════════════════════
// LOGIN SCREEN (for returning users)
// ══════════════════════════════════════════════════════════════════

function injectLoginHTML() {
  var configs = JSON.parse(localStorage.getItem('rfxUserConfigs') || '{}');
  var usernames = Object.keys(configs);

  var userListHtml = '';
  if (usernames.length > 0) {
    userListHtml = '<div style="margin-bottom:24px;">' +
      '<label style="display:block;font-size:11px;font-weight:700;color:rgba(2,223,130,0.8);' +
      'text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Select User</label>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
      usernames.map(function(u) {
        return '<button type="button" onclick="rfxLoginUser(\'' + u.replace(/'/g, "\\'") + '\')" style="padding:12px 16px;' +
          'background:rgba(2,223,130,0.08);border:1px solid rgba(2,223,130,0.25);border-radius:10px;' +
          'color:#fff;font-size:14px;font-weight:700;cursor:pointer;text-align:left;transition:all .2s;"' +
          'onmouseover="this.style.background=\'rgba(2,223,130,0.18)\';this.style.borderColor=\'rgba(2,223,130,0.5)\'"' +
          'onmouseout="this.style.background=\'rgba(2,223,130,0.08)\';this.style.borderColor=\'rgba(2,223,130,0.25)\'">' +
          '🌲 ' + u + '</button>';
      }).join('') +
      '</div></div>';
  }

  var html = '<div id="rfxLoginOverlay" style="position:fixed;inset:0;background:#000;z-index:99999;' +
    'display:flex;align-items:center;justify-content:center;padding:20px;">' +
    '<div style="background:#0A140A;border:1px solid rgba(2,223,130,0.3);border-radius:16px;' +
    'padding:32px;max-width:400px;width:100%;">' +

    '<div style="text-align:center;margin-bottom:24px;">' +
    '<div style="font-size:28px;margin-bottom:8px;">🌲</div>' +
    '<h2 style="font-size:22px;font-weight:900;color:#fff;margin:0 0 4px;">Red Forest FX</h2>' +
    '<p style="font-size:12px;color:rgba(255,255,255,0.4);margin:0;">Welcome back</p>' +
    '</div>' +

    userListHtml +

    (usernames.length > 0 ? '<div style="text-align:center;margin:16px 0;color:rgba(255,255,255,0.2);font-size:11px;">— or —</div>' : '') +

    '<div style="margin-bottom:16px;">' +
    '<label style="display:block;font-size:11px;font-weight:700;color:rgba(2,223,130,0.8);' +
    'text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">New User / Switch Account</label>' +
    '<input id="rfxLoginUser" type="text" placeholder="Enter your name" style="width:100%;padding:10px 12px;' +
    'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;' +
    'color:#fff;font-size:14px;box-sizing:border-box;outline:none;" onfocus="this.style.borderColor=\'rgba(2,223,130,0.5)\'" ' +
    'onblur="this.style.borderColor=\'rgba(255,255,255,0.12)\'">' +
    '</div>' +

    '<div style="display:flex;gap:10px;">' +
    '<button type="button" style="flex:1;padding:12px;background:transparent;' +
    'border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:rgba(255,255,255,0.6);' +
    'font-size:13px;font-weight:700;cursor:pointer;" onclick="document.getElementById(\'rfxBackupImportFile\').click()">' +
    '📥 Restore Backup</button>' +
    '<button type="button" style="flex:2;padding:12px;background:#02DF82;' +
    'border:none;border-radius:8px;color:#0A140A;font-size:13px;font-weight:800;cursor:pointer;" ' +
    'onclick="rfxLoginOrSetup()">' +
    'Continue →</button>' +
    '</div>' +

    '</div></div>' +
    '<input type="file" id="rfxBackupImportFile" accept=".json" style="display:none;" ' +
    'onchange="rfxHandleImportBackup(this)">';

  document.body.insertAdjacentHTML('beforeend', html);
}

// ══════════════════════════════════════════════════════════════════
// SETUP SUBMIT
// ══════════════════════════════════════════════════════════════════

window.rfxSubmitSetup = function() {
  var username = document.getElementById('rfxSetupUser').value.trim();
  var oandaToken = document.getElementById('rfxSetupOandaToken').value.trim();
  var oandaAcct = document.getElementById('rfxSetupOandaAcct').value.trim();
  var openRouter = document.getElementById('rfxSetupOpenRouter').value.trim();
  var tgToken = document.getElementById('rfxSetupTgToken').value.trim();
  var tgChat = document.getElementById('rfxSetupTgChat').value.trim();
  var n8n = document.getElementById('rfxSetupN8n').value.trim();

  var errEl = document.getElementById('rfxSetupError');

  if (!username) { showSetupError('Please enter your name'); return; }
  if (!oandaToken) { showSetupError('OANDA token is required'); return; }
  if (!oandaAcct) { showSetupError('OANDA account ID is required'); return; }

  var configs = JSON.parse(localStorage.getItem('rfxUserConfigs') || '{}');
  configs[username] = {
    oandaToken: oandaToken,
    oandaAccount: oandaAcct,
    openRouterKey: openRouter,
    telegramBotToken: tgToken,
    telegramChatId: tgChat,
    n8nWebhook: n8n,
    createdAt: new Date().toISOString()
  };
  localStorage.setItem('rfxUserConfigs', JSON.stringify(configs));
  localStorage.setItem('rfxCurrentUser', username);

  // Hide setup, show dashboard
  var overlay = document.getElementById('rfxSetupOverlay');
  if (overlay) overlay.style.display = 'none';

  // Update user badge
  if (typeof updateRfxUserBadge === 'function') updateRfxUserBadge();

  // Trigger page initialization
  if (window.rfxOnConfigReady) window.rfxOnConfigReady();
};

function showSetupError(msg) {
  var errEl = document.getElementById('rfxSetupError');
  if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
}

// ══════════════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════════════

window.rfxLoginUser = function(username) {
  localStorage.setItem('rfxCurrentUser', username);
  var overlay = document.getElementById('rfxLoginOverlay');
  if (overlay) overlay.style.display = 'none';
  if (typeof updateRfxUserBadge === 'function') updateRfxUserBadge();
  if (window.rfxOnConfigReady) window.rfxOnConfigReady();
};

window.rfxLoginOrSetup = function() {
  var username = document.getElementById('rfxLoginUser').value.trim();
  if (!username) return;

  var configs = JSON.parse(localStorage.getItem('rfxUserConfigs') || '{}');
  if (configs[username] && configs[username].oandaToken) {
    // Existing user, just log in
    rfxLoginUser(username);
  } else {
    // New user, show setup with pre-filled name
    document.getElementById('rfxLoginOverlay').style.display = 'none';
    document.getElementById('rfxSetupUser').value = username;
    document.getElementById('rfxSetupOverlay').style.display = 'flex';
  }
};

// ══════════════════════════════════════════════════════════════════
// BACKUP / EXPORT
// ══════════════════════════════════════════════════════════════════

window.rfxExportBackup = function() {
  var backup = {
    version: 'rfx-backup-v1',
    exportedAt: new Date().toISOString(),
    data: {}
  };

  BACKUP_KEYS.forEach(function(key) {
    var val = localStorage.getItem(key);
    if (val !== null) backup.data[key] = val;
  });

  var json = JSON.stringify(backup, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'rfx-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);

  if (typeof rfxShowToast === 'function') {
    rfxShowToast('Backup downloaded', 'ok');
  }
};

// ═════════════════════════════════════════════════════════════════
// BACKUP / IMPORT
// ══════════════════════════════════════════════════════════════════

window.rfxHandleImportBackup = function(input) {
  var file = input.files[0];
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var backup = JSON.parse(e.target.result);

      if (!backup.version || !backup.data) {
        alert('Invalid backup file.');
        return;
      }

      if (!confirm('This will restore ' + Object.keys(backup.data).length + ' items from backup. Current data will be merged. Continue?')) {
        input.value = '';
        return;
      }

      // Restore all keys
      Object.keys(backup.data).forEach(function(key) {
        localStorage.setItem(key, backup.data[key]);
      });

      // Close any overlay
      var setupOverlay = document.getElementById('rfxSetupOverlay');
      var loginOverlay = document.getElementById('rfxLoginOverlay');
      if (setupOverlay) setupOverlay.style.display = 'none';
      if (loginOverlay) loginOverlay.style.display = 'none';

      alert('Backup restored! Reloading...');
      location.reload();

    } catch(err) {
      alert('Error reading backup: ' + err.message);
    }
  };
  reader.readAsText(file);
  input.value = '';
};

// ══════════════════════════════════════════════════════════════════
// INIT — check if user is logged in, show appropriate screen
// ══════════════════════════════════════════════════════════════════

function rfxAuthInit() {
  var configs = JSON.parse(localStorage.getItem('rfxUserConfigs') || '{}');
  var currentUser = localStorage.getItem('rfxCurrentUser') || '';

  // Block main content until auth is done
  document.body.style.visibility = 'hidden';

  if (currentUser && configs[currentUser] && configs[currentUser].oandaToken) {
    // Logged in — hide overlays, show dashboard
    document.body.style.visibility = 'visible';
    if (typeof updateRfxUserBadge === 'function') updateRfxUserBadge();
    if (window.rfxOnConfigReady) window.rfxOnConfigReady();
  } else if (Object.keys(configs).length > 0) {
    // Has users but not logged in — show login
    injectLoginHTML();
    document.body.style.visibility = 'visible';
  } else {
    // No users at all — show setup
    injectSetupHTML();
    document.body.style.visibility = 'visible';
  }
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', rfxAuthInit);
} else {
  rfxAuthInit();
}

})();
