// cart.js
export let cart = [];

export function loadCart() {
    try {
        const storedCart = localStorage.getItem('cart');
        if (storedCart) {
            cart = JSON.parse(storedCart);
        } else {
            cart = [];
        }
    } catch (e) {
        console.error("Kunde inte ladda varukorgen från localStorage:", e);
        cart = [];
    }
    updateCartCount();
}

export function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
}

export function updateCartCount() {
    const cartCountElement = document.getElementById('cart-count');
    if (cartCountElement) {
        cartCountElement.textContent = cart.length;
    }
}

export function getCart() {
    return cart;
}

export function addToCart(item) {
    cart.push(item);
    saveCart();
    renderCart();
    showConfirmationToast();
}

export function editCartItem(index, newItem) {
    cart[index] = newItem;
    saveCart();
    renderCart();
    showConfirmationToast("Vara uppdaterad i varukorgen!");
}

export function removeFromCart(index) {
    cart.splice(index, 1);
    saveCart();
    renderCart();
}

export function clearCart() {
    cart = [];
    saveCart();
    renderCart();
}

export function renderCart() {
    const cartItemsEl = document.getElementById('cart-items');
    if (!cartItemsEl) return;

    cartItemsEl.innerHTML = '';
    
    if (cart.length === 0) {
        cartItemsEl.innerHTML = '<p class="text-center text-gray-500">Din varukorg är tom.</p>';
    } else {
        cart.forEach((item, index) => {
            // Här behövs priser, etc, som normalt finns i index-main.js.
            // För att undvika beroenden mellan filerna läggs priset till direkt i varukorgen
            // när kortet väljs, vilket redan är implementerat i `index.html`.
            const priceDisplay = `<span class="font-bold">${item.price.toFixed(2)} kr</span>`;
            
            const recipientText = `${item.recipient.name}, ${item.recipient.address}, ${item.recipient.zip} ${item.recipient.city}, ${item.recipient.country}`;
            const messageText = item.message.substring(0, 50) + (item.message.length > 50 ? '...' : '');

            cartItemsEl.innerHTML += `
                <div class="flex flex-col p-2 bg-gray-100 rounded-md">
                    <div class="flex items-center justify-between">
                        <p class="font-semibold">${item.title} (${item.size.charAt(0).toUpperCase() + item.size.slice(1)})</p>
                        <div class="flex items-center space-x-2">
                            <button onclick="window.openPostcardModal('${item.id}', ${index})" class="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600">Ändra</button>
                            <button onclick="window.removeFromCart(${index})" class="px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600">Ta bort</button>
                        </div>
                    </div>
                    <div class="mt-2 text-sm text-gray-600 cart-item-details">
                        <strong>Pris:</strong>
                        <span>${priceDisplay}</span>
                        <strong>Text:</strong>
                        <span>${messageText || 'Ingen text'}</span>
                        <strong>Mottagare:</strong>
                        <span>${recipientText || 'Ej angiven'}</span>
                    </div>
                </div>
            `;
        });
    }

    // Uppdatera totalsummor (denna logik kan behöva flyttas eller hämtas från index-main)
    // Jag har valt att behålla den i index-main.js för att undvika cirkulära beroenden
}

function showConfirmationToast(message) {
    const toast = document.getElementById('confirmation-toast');
    if (toast) {
        toast.textContent = message;
        toast.classList.add('active');
        setTimeout(() => {
            toast.classList.remove('active');
        }, 2000);
    }
}