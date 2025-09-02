// qr.js
// Observera: Den här filen kräver att qrcode.js har laddats i din HTML-fil.
// Du kan lägga till den med <script src="https://cdn.rawgit.com/davidshimjs/qrcodejs/gh-pages/qrcode.min.js"></script>

window.createSwishQrCode = function(amount, message) {
    const swishNumber = '0702249015'; // Ditt Swish-nummer
    // Swish-protokollet för QR-koder
    const swishUrl = `C://payee=${swishNumber};amount=${amount.toFixed(2)};message=${message}`;
    
    const qrCodeContainer = document.getElementById('swish-qr-code');
    // Rensa tidigare QR-kod
    qrCodeContainer.innerHTML = '';
    
    // Generera en ny QR-kod i containern
    new QRCode(qrCodeContainer, {
        text: swishUrl,
        width: 192,
        height: 192,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
}