/* ============================================
   SISTEMA DE ASISTENCIA ESCOLAR
   Notification Utilities
   ============================================ */

let pollIntervalId = null;

function initNotificationPolling(fetchCallback, intervalMs = 30000) {
    stopNotificationPolling();
    if (typeof fetchCallback === 'function') {
        fetchCallback();
        pollIntervalId = setInterval(fetchCallback, intervalMs);
    }
}

function stopNotificationPolling() {
    if (pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
    }
}

async function requestBrowserNotification() {
    if ('Notification' in window && Notification.permission === 'default') {
        try {
            await Notification.requestPermission();
        } catch (e) { /* silent */ }
    }
}

function showBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(title, { body: body || '', icon: '/img/school-icon.png' });
        } catch (e) { /* silent */ }
    }
}

function playNotificationSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.3;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.3);
    } catch (e) { /* silent */ }
}
