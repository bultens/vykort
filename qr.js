// qr.js
// Observera: Den här filen kräver att qrcode.js har laddats i din HTML-fil.

/**
 * Skapar en Swish QR-kod baserat på belopp, meddelande och mottagarnummer.
 * @param {number} amount - Beloppet som ska betalas.
 * @param {string} message - Meddelandet (t.ex. ordernummer) som ska skickas med.
 * @param {string} swishNumber - Mottagarens Swish-nummer (hämtas dynamiskt från admin-inställningar).
 */
export function createSwishQrCode(amount, message, swishNumber) {
    // Swish-protokollet för QR-koder
    const formattedAmount = amount.toFixed(2);
    
    // Använder swishNumber som skickas in från anropet i index-functions.js
    const swishUrl = `https://app.swish.nu/1/p/sw/?sw=${swishNumber}&amt=${formattedAmount}&cur=SEK&msg=${message}`;
    
    const qrCodeContainer = document.getElementById('swish-qr-code');
    
    // Rensa tidigare QR-kod om användaren t.ex. går fram och tillbaka i kassan
    if (qrCodeContainer) {
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
}