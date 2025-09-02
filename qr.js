// qr.js
// Observera: Den här filen kräver att qrcode.js har laddats i din HTML-fil.
// Du kan lägga till den med <script src="https://cdn.rawgit.com/davidshimjs/qrcodejs/gh-pages/qrcode.min.js"></script>

export function createSwishQrCode(amount, message) {
    const swishNumber = '0702249015'; // Ditt Swish-nummer
    const payeeName = 'Vykort'; // Namn på betalningsmottagare
    
    // Swish-protokollet för QR-koder enligt det angivna formatet
    const formattedAmount = amount.toFixed(2);
    const swishUrl = `https://app.swish.nu/1/p/sw/?sw=${swishNumber}&amt=${formattedAmount}&cur=SEK&msg=${message}`;
    
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