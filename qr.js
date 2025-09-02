// qr.js
// Kräver att qrcode.min.js är laddat i HTML-filen innan denna körs
// <script src="https://cdn.rawgit.com/davidshimjs/qrcodejs/gh-pages/qrcode.min.js"></script>

export function createSwishQrCode(amount, message) {
    const swishNumber = "0702249015"; // Ditt Swish-nummer
    
    // Se till att amount är korrekt formatterat (ex: "100.00")
    const formattedAmount = amount.toFixed(2).replace(",", ".");
    
    // Swish officiella protokoll
    const swishUrl = `swish://payment?version=1&payee=${swishNumber}&amount=${formattedAmount}&message=${encodeURIComponent(message)}`;
    
    const qrCodeContainer = document.getElementById("swish-qr-code");
    if (!qrCodeContainer) {
        console.error("Kunde inte hitta elementet #swish-qr-code");
        return;
    }

    // Rensa eventuell tidigare QR-kod
    qrCodeContainer.innerHTML = "";

    // Generera en ny QR-kod
    new QRCode(qrCodeContainer, {
        text: swishUrl,
        width: 192,
        height: 192,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
}
