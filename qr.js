import QRCode from 'https://cdn.rawgit.com/davidshimjs/qrcodejs/gh-pages/qrcode.min.js';

window.createSwishQrCode = function(amount, message) {
    const swishNumber = '0702249015'; // Ditt Swish-nummer
    const swishUrl = `C://payee=${swishNumber};amount=${amount.toFixed(2)};message=${message}`;
    
    // Clear any previous QR code
    const qrCodeContainer = document.getElementById('swish-qr-code');
    qrCodeContainer.innerHTML = '';
    
    new QRCode(qrCodeContainer, {
        text: swishUrl,
        width: 192,
        height: 192,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
}