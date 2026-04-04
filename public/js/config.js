if (typeof WS_SERVER_URL === 'undefined') {
const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const hostname = window.location.hostname;
window.WS_SERVER_URL = protocol + '://' + hostname + ':8080';
}
