// Version 1.02
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirestore, onSnapshot, collection, query, orderBy, where, getDocs, addDoc, serverTimestamp, updateDoc, doc } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";
import { createSwishQrCode } from "./qr.js";

const appId = firebaseConfig.projectId;
//const swishNumber = '0702249015';

let currentTagFilter = null;
let db;
let auth;
let postcardsData = [];
let priceGroupsData = [];
let groupsData = [];
let salesData = [];
let cart = [];
let currentUser = null;
let swishSettings = { number: '0722283154', name: 'Mats Jonsson' }; // Standardvärden ifall inget finns i DB
let carouselInterval;
let currentSlide = 0;
let highlightPostcards = [];

let initialDataLoaded = {
    postcards: false,
    priceGroups: false,
    groups: false,
    sales: false,
    news: false
};
let allDataLoaded = false;

document.addEventListener('DOMContentLoaded', () => {
    if (firebaseConfig.projectId) {
        try {
            const app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);
            
            onAuthStateChanged(auth, async (user) => {
                currentUser = user;
                const adminLink = document.getElementById('nav-admin-link');
                
                if (user) {
                    console.log("Användare inloggad:", user.email || user.uid);
                    updateUserStatus(true);
                    renderOrderHistory();

                    // --- NY KOD: Visa Admin-länk om behörighet finns ---
                    try {
                        const adminsRef = collection(db, `artifacts/${appId}/public/data/admins`);
                        const q = query(adminsRef, where("email", "==", user.email));
                        const snapshot = await getDocs(q);

                        if (!snapshot.empty) {
                            // Det ÄR en admin -> Visa länken
                            console.log("Admin identifierad - visar menyval.");
                            if(adminLink) adminLink.classList.remove('hidden');
                        } else {
                            // Inte admin -> Se till att den är dold
                            if(adminLink) adminLink.classList.add('hidden');
                        }
                    } catch (e) {
                        console.error("Kunde inte kontrollera admin-status:", e);
                    }
                    // ---------------------------------------------------

                } else {
                    console.log("Användare utloggad.");
                    updateUserStatus(false);
                    // Dölj länken om man loggar ut
                    if(adminLink) adminLink.classList.add('hidden');
                }
            });

            startListeners();
        } catch (e) {
            console.error("Firebase initieringsfel:", e);
            const postcardsList = document.getElementById('postcards-list');
            if(postcardsList) {
                postcardsList.innerHTML = '<p class="text-center text-red-500">Kunde inte ansluta till databasen.</p>';
            }
        }
    } else {
        const postcardsList = document.getElementById('postcards-list');
        if(postcardsList) {
            postcardsList.innerHTML = '<p class="text-center text-red-500">Firebase-konfiguration saknas.</p>';
        }
    }
    const contactModal = document.getElementById('contactModal');
    const openContactLink = document.getElementById('open-contact-link');
    const closeContactBtn = document.getElementById('close-contact-modal');
    const contactForm = document.getElementById('contact-form');

    if (openContactLink) {
        openContactLink.addEventListener('click', (e) => {
            e.preventDefault();
            contactModal.classList.add('active');
            
            // Om användaren är inloggad, förifyll namn och e-post
            if (currentUser) {
                document.getElementById('contact-email').value = currentUser.email || '';
                // Försök hitta namn om det finns sparat, annars tomt
            }
        });
    }

    if (closeContactBtn) {
        closeContactBtn.addEventListener('click', () => {
            contactModal.classList.remove('active');
        });
    }
    
    // Stäng om man klickar utanför
    window.addEventListener('click', (event) => {
        if (event.target === contactModal) {
            contactModal.classList.remove('active');
        }
    });

    // Skicka meddelandet
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('contact-name').value;
            const email = document.getElementById('contact-email').value;
            const message = document.getElementById('contact-message').value;
            const submitBtn = contactForm.querySelector('button[type="submit"]');
            
            submitBtn.textContent = "Skickar...";
            submitBtn.disabled = true;

            try {
                await addDoc(collection(db, `artifacts/${appId}/public/data/messages`), {
                    name,
                    email,
                    message,
                    timestamp: serverTimestamp(),
                    read: false // Markeras som oläst från början
                });
                
                contactModal.classList.remove('active');
                contactForm.reset();
                showConfirmationToast("Tack! Ditt meddelande har skickats.");
            } catch (error) {
                console.error("Fel vid skickande av meddelande:", error);
                showErrorModal("Fel", "Kunde inte skicka meddelandet just nu.");
            } finally {
                submitBtn.textContent = "Skicka meddelande";
                submitBtn.disabled = false;
            }
        });
    }
    
    loadCart();
    
    // Setup all event listeners
    const groupFilter = document.getElementById('group-filter');
    if (groupFilter) groupFilter.addEventListener('change', renderPostcards);
    
    const cartBtn = document.getElementById('cart-btn');
    if (cartBtn) cartBtn.addEventListener('click', () => {
        renderCart();
        document.getElementById('cartModal')?.classList.add('active');
    });

    const closeCartModal = document.getElementById('close-cart-modal');
    if(closeCartModal) closeCartModal.addEventListener('click', () => document.getElementById('cartModal')?.classList.remove('active'));
    
    window.addEventListener('click', (event) => {
        const cartModal = document.getElementById('cartModal');
        if (cartModal && event.target === cartModal) cartModal.classList.remove('active');
    });
    
    const closePostcardModal = document.getElementById('close-postcard-modal');
    if (closePostcardModal) closePostcardModal.addEventListener('click', () => document.getElementById('postcardModal')?.classList.remove('active'));
    
    window.addEventListener('click', (event) => {
        const postcardModal = document.getElementById('postcardModal');
        if (postcardModal && event.target === postcardModal) postcardModal.classList.remove('active');
    });

    const addToCartForm = document.getElementById('add-to-cart-form');
    if (addToCartForm) addToCartForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target;
        const postcardId = form.querySelector('#modal-postcard-id').value;
        const cartItemIndex = form.querySelector('#modal-cart-item-index').value;
        const size = form.querySelector('input[name="size"]:checked').value;
        const recipientName = form.querySelector('#modal-recipient-name').value;
        const recipientAddress = form.querySelector('#modal-recipient-address').value;
        const recipientAddress2 = form.querySelector('#modal-recipient-address2').value;
        const recipientZip = form.querySelector('#modal-recipient-zip').value;
        const recipientCity = form.querySelector('#modal-recipient-city').value;
        const recipientCountry = form.querySelector('#modal-recipient-country').value;
        const messageText = form.querySelector('#modal-message-text').value;

        const postcard = postcardsData.find(p => p.id === postcardId);
        if (!postcard) {
            console.error("Kunde inte lägga till i varukorgen, vykortet hittades inte.");
            return;
        }

        const prices = calculatePrice(postcard);
        const price = prices[size];
        
        const newItem = {
            id: postcardId,
            title: postcard.title,
            size: size,
            price: price,
            group: postcard.group,
            recipient: {
                name: recipientName,
                address: recipientAddress,
                address2: recipientAddress2,
                zip: recipientZip,
                city: recipientCity,
                country: recipientCountry
            },
            message: messageText
        };

        if (cartItemIndex !== "" && parseInt(cartItemIndex) !== -1) {
            editCartItem(parseInt(cartItemIndex), newItem);
        } else {
            addToCart(newItem);
        }
        
        document.getElementById('postcardModal')?.classList.remove('active');
        form.reset();
    });

    const clearCartBtn = document.getElementById('clear-cart-btn');
    if (clearCartBtn) clearCartBtn.addEventListener('click', clearCart);

    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', () => {
        document.getElementById('cartModal')?.classList.remove('active');
        document.getElementById('checkoutModal')?.classList.add('active');
        renderCheckout();
    });
    
    const guestCheckoutBtn = document.getElementById('guest-checkout-btn');
    if (guestCheckoutBtn) guestCheckoutBtn.addEventListener('click', () => {
        document.getElementById('checkout-start-section')?.classList.add('hidden');
        document.getElementById('billing-info-section')?.classList.remove('hidden');
    });

    const loginCheckoutBtn = document.getElementById('login-checkout-btn');
    if (loginCheckoutBtn) loginCheckoutBtn.addEventListener('click', () => {
        document.getElementById('checkout-start-section')?.classList.add('hidden');
        document.getElementById('checkout-login-section')?.classList.remove('hidden');
    });

    const loginLink = document.getElementById('login-link');
    if (loginLink) loginLink.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('userModal')?.classList.add('active');
    });

    const closeUserModal = document.getElementById('close-user-modal');
    if (closeUserModal) closeUserModal.addEventListener('click', () => document.getElementById('userModal')?.classList.remove('active'));

    const registerSwitch = document.getElementById('register-switch');
    if (registerSwitch) registerSwitch.addEventListener('click', () => {
        document.getElementById('login-form')?.classList.add('hidden');
        document.getElementById('register-form')?.classList.remove('hidden');
        document.getElementById('register-switch')?.classList.add('hidden');
        document.getElementById('login-switch')?.classList.remove('hidden');
        const userModalTitle = document.getElementById('user-modal-title');
        if (userModalTitle) userModalTitle.textContent = "Skapa konto";
    });

    const loginSwitch = document.getElementById('login-switch');
    if (loginSwitch) loginSwitch.addEventListener('click', () => {
        document.getElementById('login-form')?.classList.remove('hidden');
        document.getElementById('register-form')?.classList.add('hidden');
        document.getElementById('register-switch')?.classList.remove('hidden');
        document.getElementById('login-switch')?.classList.add('hidden');
        const userModalTitle = document.getElementById('user-modal-title');
        if (userModalTitle) userModalTitle.textContent = "Logga in";
    });

    const userStatus = document.getElementById('user-status');
    if (userStatus) userStatus.addEventListener('click', async (e) => {
        if (e.target.id === 'logout-link') {
            e.preventDefault();
            await signOut(auth);
            document.getElementById('main-content')?.classList.remove('hidden');
            document.getElementById('checkoutModal')?.classList.remove('active');
        }
    });

    const loginForm = document.getElementById('login-form');
    if(loginForm) loginForm.addEventListener('submit', handleLogin);

    const registerForm = document.getElementById('register-form');
    if(registerForm) registerForm.addEventListener('submit', handleRegister);
    
    const checkoutLoginForm = document.getElementById('checkout-login-form');
    if(checkoutLoginForm) checkoutLoginForm.addEventListener('submit', handleCheckoutLogin);
    
    const checkoutRegisterForm = document.getElementById('checkout-register-form');
    if(checkoutRegisterForm) checkoutRegisterForm.addEventListener('submit', handleCheckoutRegister);
    
    const billingInfoForm = document.getElementById('billing-info-form');
    if(billingInfoForm) billingInfoForm.addEventListener('submit', handlePlaceOrder);
    
    const closeCheckoutModal = document.getElementById('close-checkout-modal');
    if (closeCheckoutModal) closeCheckoutModal.addEventListener('click', () => {
        document.getElementById('checkoutModal')?.classList.remove('active');
        document.getElementById('main-content')?.classList.remove('hidden');
    });

    const closeErrorModal = document.getElementById('close-error-modal');
    if (closeErrorModal) closeErrorModal.addEventListener('click', () => document.getElementById('errorModal')?.classList.remove('active'));
    
    window.addEventListener('click', (event) => {
        const errorModal = document.getElementById('errorModal');
        if (errorModal && event.target === errorModal) errorModal.classList.remove('active');
    });
});

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
        document.getElementById('userModal')?.classList.remove('active');
        showConfirmationToast("Inloggad!");
    } catch (error) {
        console.error("Login error:", error.code, error.message);
        let title = "Inloggningen misslyckades";
        let message = "Kontrollera din e-postadress och ditt lösenord.";

        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            message = "Felaktig e-postadress eller lösenord.";
        } else if (error.code === 'auth/invalid-email') {
            message = "Ogiltig e-postadress.";
        }

        showErrorModal(title, message);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    if (password.length < 6) {
        showErrorModal("Lösenordet är för svagt", "Lösenordet måste vara minst 6 tecken långt.");
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        await addDoc(collection(db, `artifacts/${appId}/public/data/users`), {
            uid: userCredential.user.uid,
            username: username
        });
        
        document.getElementById('userModal')?.classList.remove('active');
        showConfirmationToast("Konto skapat och inloggad!");
    } catch (error) {
        console.error("Registration error:", error.code, error.message);
        let title = "Registreringen misslyckades";
        let message = "Ett okänt fel uppstod.";

        switch (error.code) {
            case 'auth/email-already-in-use':
                title = "E-postadressen används redan";
                message = "Den angivna e-postadressen används redan av ett annat konto.";
                break;
            case 'auth/invalid-email':
                title = "Ogiltig e-postadress";
                message = "Vänligen ange en giltig e-postadress.";
                break;
            case 'auth/operation-not-allowed':
                title = "Registrering ej tillåten";
                message = "E-post-/lösenordsinloggning är inte aktiverat. Kontakta administratören.";
                break;
            case 'auth/weak-password':
                title = "Lösenordet är för svagt";
                message = "Lösenordet måste vara minst 6 tecken långt.";
                break;
            default:
                message = error.message;
                break;
        }
        showErrorModal(title, message);
    }
}

async function handleCheckoutLogin(e) {
    e.preventDefault();
    const email = document.getElementById('checkout-login-email').value;
    const password = document.getElementById('checkout-login-password').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
        showConfirmationToast("Inloggad i kassan!");
        renderCheckout();
    } catch (error) {
        console.error("Login error:", error.code, error.message);
        let title = "Inloggningen misslyckades";
        let message = "Kontrollera din e-postadress och ditt lösenord.";

        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            message = "Felaktig e-postadress eller lösenord.";
        } else if (error.code === 'auth/invalid-email') {
            message = "Ogiltig e-postadress.";
        }
        showErrorModal(title, message);
    }
}

async function handleCheckoutRegister(e) {
    e.preventDefault();
    const username = document.getElementById('checkout-register-username').value;
    const email = document.getElementById('checkout-register-email').value;
    const password = document.getElementById('checkout-register-password').value;
    
    if (password.length < 6) {
        showErrorModal("Lösenordet är för svagt", "Lösenordet måste vara minst 6 tecken långt.");
        return;
    }
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await addDoc(collection(db, `artifacts/${appId}/public/data/users`), {
            uid: userCredential.user.uid,
            username: username
        });
        showConfirmationToast("Konto skapat och inloggad i kassan!");
        renderCheckout();
    } catch (error) {
        console.error("Registration error:", error.code, error.message);
        let title = "Registreringen misslyckades";
        let message = "Ett okänt fel uppstod.";

        switch (error.code) {
            case 'auth/email-already-in-use':
                title = "E-postadressen används redan";
                message = "Den angivna e-postadressen används redan av ett annat konto.";
                break;
            case 'auth/invalid-email':
                title = "Ogiltig e-postadress";
                message = "Vänligen ange en giltig e-postadress.";
                break;
            case 'auth/operation-not-allowed':
                title = "Registrering ej tillåten";
                message = "E-post-/lösenordsinloggning är inte aktiverat. Kontakta administratören.";
                break;
            case 'auth/weak-password':
                title = "Lösenordet är för svagt";
                message = "Lösenordet måste vara minst 6 tecken långt.";
                break;
            default:
                message = error.message;
                break;
        }
        showErrorModal(title, message);
    }
}

async function handlePlaceOrder(e) {
    e.preventDefault();
    
    // Samla in faktureringsuppgifter från formuläret
    const billingInfo = {
        name: document.getElementById('billing-name').value,
        address: document.getElementById('billing-address').value,
        zip: document.getElementById('billing-zip').value,
        city: document.getElementById('billing-city').value,
        mobile: document.getElementById('billing-mobile').value,
        email: document.getElementById('billing-email').value
    };
    
    // Förbered artiklar för ordern med aktuella rabatter
    const cartItemsForOrder = cart.map(item => ({
        id: item.id,
        title: item.title,
        size: item.size,
        price: getDiscountedPrice(item),
        message: item.message,
        recipient: item.recipient,
        status: 'obehandlad'
    }));
    
    // Beräkna totalbelopp och avrunda nedåt till heltal
    const { finalTotal } = calculateCartTotal();
    const roundedTotal = Math.floor(finalTotal);
    
    // Generera ett slumpmässigt femsiffrigt ordernummer
    const orderNumber = Math.floor(10000 + Math.random() * 90000).toString();

    try {
        // Spara ordern i den publika samlingen för administratören
        const docRef = await addDoc(collection(db, `artifacts/${appId}/public/data/orders`), {
            orderNumber: orderNumber,
            items: cartItemsForOrder,
            total: roundedTotal,
            billingInfo: billingInfo,
            timestamp: serverTimestamp(),
            userId: currentUser ? currentUser.uid : null,
            isGuest: !currentUser,
            status: 'Ny'
        });
        
        // Om användaren är inloggad, spara även en kopia i användarens privata historik
        if (currentUser) {
            const privateOrderData = {
                items: cartItemsForOrder.map(item => ({
                    id: item.id,
                    title: item.title,
                    size: item.size,
                    price: getDiscountedPrice(item),
                    status: 'obehandlad'
                })),
                total: roundedTotal,
                timestamp: serverTimestamp(),
                orderId: docRef.id,
                orderNumber: orderNumber,
                status: 'Ny'
            };
            
            // Korrekt sökväg för privata användarordrar
            const privateOrdersCollection = collection(db, `artifacts/public/users/${currentUser.uid}/orders`);
            const privateDocRef = await addDoc(privateOrdersCollection, privateOrderData);
            
            // Uppdatera den publika ordern med en referens till den privata
            await updateDoc(docRef, { privateOrderId: privateDocRef.id });
        }
        
        // Hantera gränssnittet efter lagd beställning
        document.getElementById('billing-info-section')?.classList.add('hidden');
        document.getElementById('order-confirmation-section')?.classList.remove('hidden');
        
        // Visa ordernummer och totalsumma i bekräftelsen
        const orderIdDisplay = document.getElementById('order-id-display');
        if (orderIdDisplay) orderIdDisplay.textContent = orderNumber;
        
        const orderTotalDisplay = document.getElementById('order-total-display');
        if (orderTotalDisplay) orderTotalDisplay.textContent = roundedTotal.toFixed(2).replace('.', ',');

        // --- DYNAMISK SWISH-UPPDATERING ---
        // Uppdatera texten med Swish-nummer och namn från admin-inställningarna
        const confirmationSection = document.getElementById('order-confirmation-section');
        if (confirmationSection) {
            const swishInfoStrong = confirmationSection.querySelector('p strong');
            if (swishInfoStrong) {
                // swishSettings hämtas via onSnapshot i startListeners
                swishInfoStrong.textContent = `${swishSettings.number} (${swishSettings.name})`;
            }
        }
        
        // Generera QR-kod med det dynamiska numret
        createSwishQrCode(roundedTotal, orderNumber, swishSettings.number);
        // ----------------------------------
        
        clearCart(); // Töm varukorgen efter lyckad beställning
        
    } catch (e) {
        console.error("Fel vid beställning:", e);
        showErrorModal("Beställningen misslyckades", "Ett fel uppstod när din beställning skulle sparas. Vänligen försök igen.");
    }
}


async function updateUserStatus(isLoggedIn) {
    const userStatusEl = document.getElementById('user-status');
    if (!userStatusEl) return;

    if (isLoggedIn) {
        const user = auth.currentUser;
        let username = 'Användare';
        try {
            const usersRef = collection(db, `artifacts/${appId}/public/data/users`);
            const q = query(usersRef, where('uid', '==', user.uid));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                username = querySnapshot.docs[0].data().username;
            }
        } catch (e) {
            console.error("Kunde inte hämta användarnamn:", e);
        }
        
        userStatusEl.innerHTML = `<span class="font-bold">Hej, ${username}!</span> | <a href="#" id="logout-link" class="hover:text-gray-300 transition duration-300">Logga ut</a> | <a href="#" id="orders-link" class="hover:text-gray-300 transition duration-300">Mina ordrar</a>`;
        
        const ordersLink = document.getElementById('orders-link');
        if(ordersLink) {
            ordersLink.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('main-content')?.classList.add('hidden');
                document.getElementById('checkoutModal')?.classList.add('active');
                renderCheckout(true);
            });
        }
    } else {
        userStatusEl.innerHTML = `<a href="#" id="login-link" class="hover:text-gray-300 transition duration-300">Logga in</a>`;
        const loginLink = document.getElementById('login-link');
        if (loginLink) {
            loginLink.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('userModal')?.classList.add('active');
            });
        }
    }
}

function renderCheckout(showOrders = false) {
    document.getElementById('checkout-start-section')?.classList.add('hidden');
    document.getElementById('checkout-login-section')?.classList.add('hidden');
    document.getElementById('billing-info-section')?.classList.add('hidden');
    document.getElementById('order-history-section')?.classList.add('hidden');
    document.getElementById('order-confirmation-section')?.classList.add('hidden');
    document.getElementById('main-content')?.classList.add('hidden');

    if (showOrders && currentUser) {
        document.getElementById('order-history-section')?.classList.remove('hidden');
        renderOrderHistory();
    } else if (currentUser) {
        const billingInfoSection = document.getElementById('billing-info-section');
        if (billingInfoSection) {
            billingInfoSection.classList.remove('hidden');
            const billingEmail = document.getElementById('billing-email');
            if (billingEmail) billingEmail.value = currentUser.email;
        }
    } else {
        document.getElementById('checkout-start-section')?.classList.remove('hidden');
    }
}

// Ny funktion för att visa betalinfo för en befintlig order
window.showOrderPaymentInfo = function(orderNumber, total) {
    document.getElementById('order-history-section')?.classList.add('hidden');
    document.getElementById('order-confirmation-section')?.classList.remove('hidden');
    
    const orderIdDisplay = document.getElementById('order-id-display');
    if (orderIdDisplay) orderIdDisplay.textContent = orderNumber;
    
    const orderTotalDisplay = document.getElementById('order-total-display');
    if (orderTotalDisplay) orderTotalDisplay.textContent = total.toFixed(2).replace('.', ',');

    const confirmationSection = document.getElementById('order-confirmation-section');
    if (confirmationSection) {
        const swishInfoStrong = confirmationSection.querySelector('p strong');
        if (swishInfoStrong) {
            swishInfoStrong.textContent = `${swishSettings.number} (${swishSettings.name})`;
        }
    }
    
    createSwishQrCode(total, orderNumber, swishSettings.number);
};

// Uppdaterad renderOrderHistory med onSnapshot för realtidsstatus
async function renderOrderHistory() {
    if (!currentUser) return;

    const orderHistoryList = document.getElementById('order-history-list');
    if (!orderHistoryList) return;
    
    orderHistoryList.innerHTML = '<p class="text-gray-500">Laddar orderhistorik...</p>';
    
    // Vi skapar en lyssnare istället för getDocs för att se statusändringar direkt
    const ordersRef = collection(db, `artifacts/public/users/${currentUser.uid}/orders`);
    const q = query(ordersRef, orderBy('timestamp', 'desc'));
    
    onSnapshot(q, (querySnapshot) => {
        if (querySnapshot.empty) {
            orderHistoryList.innerHTML = '<p class="text-gray-500">Inga tidigare ordrar hittades.</p>';
            return;
        }
        
        orderHistoryList.innerHTML = ''; 
        
        querySnapshot.forEach(doc => {
            const order = doc.data();
            const orderDiv = document.createElement('div');
            orderDiv.className = 'p-4 bg-gray-100 rounded-lg shadow-sm mb-4';
            
            const timestamp = order.timestamp?.toDate ? order.timestamp.toDate().toLocaleString('sv-SE') : 'Okänt datum';
            const orderNumberToDisplay = order.orderNumber || order.orderId;
            const status = order.status || 'Ny';

            // Logik för att visa betalningsknapp
            let paymentButtonHtml = '';
            if (status === 'Väntar' || status === 'Avakta Betalning' || status === 'Ny' ) {
                paymentButtonHtml = `
                    <button onclick="window.showOrderPaymentInfo('${orderNumberToDisplay}', ${order.total})" 
                            class="mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-md hover:bg-blue-700 transition">
                        Visa betalningsinfo / QR
                    </button>`;
            }

            orderDiv.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-lg">Order #${orderNumberToDisplay}</h4>
                        <p class="text-sm text-gray-600">Datum: ${timestamp}</p>
                        <p class="text-sm font-semibold">Status: <span class="text-blue-600">${status}</span></p>
                    </div>
                    <div class="text-right">
                        <p class="font-bold">${order.total.toFixed(2)} kr</p>
                    </div>
                </div>
                <div class="mt-2 space-y-1 border-t pt-2">
                    ${order.items.map(item => `<p class="text-xs text-gray-700">- ${item.title} (${item.size}): ${item.price.toFixed(2)} kr</p>`).join('')}
                </div>
                ${paymentButtonHtml}
            `;
            orderHistoryList.appendChild(orderDiv);
        });
    }, (error) => {
        console.error("Fel vid hämtning av orderhistorik:", error);
        orderHistoryList.innerHTML = '<p class="text-red-500">Kunde inte ladda din orderhistorik.</p>';
    });
}


function loadCart() {
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

function checkAndRender() {
    if (initialDataLoaded.postcards && initialDataLoaded.priceGroups && initialDataLoaded.groups) {
        if (!allDataLoaded) {
            renderPostcards();
            renderCarousel(); // NYTT: Initiera karusellen
            renderCart();
            allDataLoaded = true;
            console.log("Data laddad - Butiken visas");
        }
    }
}

function startListeners() {
    onSnapshot(collection(db, `artifacts/${appId}/public/data/postcards`), (snapshot) => {
        postcardsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        initialDataLoaded.postcards = true;
        checkAndRender();
    });
    onSnapshot(collection(db, `artifacts/${appId}/public/data/priceGroups`), (snapshot) => {
        priceGroupsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        initialDataLoaded.priceGroups = true;
        checkAndRender();
    });
    onSnapshot(query(collection(db, `artifacts/${appId}/public/data/groups`), orderBy('order')), (snapshot) => {
        groupsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        populateFilters(); 
        initialDataLoaded.groups = true;
        checkAndRender();
    });
    onSnapshot(doc(db, `artifacts/${appId}/public/data/settings`, 'swish'), (snapshot) => {
        if (snapshot.exists()) {
            swishSettings = snapshot.data();
            console.log("Swish-inställningar uppdaterade:", swishSettings);
        }
    });
    onSnapshot(collection(db, `artifacts/${appId}/public/data/sales`), (snapshot) => {
        salesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        initialDataLoaded.sales = true;
        checkAndRender();
    });
    onSnapshot(query(collection(db, `artifacts/${appId}/public/data/news`), orderBy('order')), (snapshot) => {
        const newsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderNews(newsData);
        initialDataLoaded.news = true;
        checkAndRender();
    });
}

function renderNews(news) {
    const newsList = document.getElementById('news-list');
    if (!newsList) return;
    
    newsList.innerHTML = '';
    
    const now = new Date();
    const activeNews = news.filter(item => 
        item.noTimeLimit || (item.startDate && item.endDate && now >= new Date(item.startDate) && now <= new Date(item.endDate))
    );

    const newsSection = document.getElementById('news-section');
    if (!newsSection) return;

    if (activeNews.length === 0) {
        newsSection.classList.add('hidden');
    } else {
        newsSection.classList.remove('hidden');
        activeNews.forEach(item => {
            const newsItem = document.createElement('div');
            newsItem.className = 'news-item';
            newsItem.innerHTML = `
                <h3 class="font-bold text-lg mb-1">${item.title}</h3>
                <p class="text-sm">${item.text}</p>
            `;
            newsList.appendChild(newsItem);
        });
    }
}

function populateFilters() {
    const groupFilter = document.getElementById('group-filter');
    if (!groupFilter) return;

    // Spara vad användaren har valt, eller kolla om vi ska sätta en default
    let currentValue = groupFilter.value;
    
    groupFilter.innerHTML = '<option value="all">Alla Grupper</option>';
    
    let defaultGroupId = 'all';

    groupsData.forEach(g => {
        const option = document.createElement('option');
        option.value = g.id;
        option.textContent = g.name;
        groupFilter.appendChild(option);
        
        // Om gruppen är markerad som standard i databasen
        if (g.isDefault) {
            defaultGroupId = g.id;
        }
    });

    // Om användaren inte har valt något manuellt ännu, använd default-gruppen
    if (!currentValue || currentValue === "") {
        groupFilter.value = defaultGroupId;
    } else {
        groupFilter.value = currentValue;
    }
}

function calculatePrice(postcard) {
    const priceGroup = priceGroupsData.find(pg => pg.id === postcard.priceGroup);
    return priceGroup ? priceGroup.prices : { liten: 0, mellan: 0, stor: 0 };
}

function getDiscountedPrice(item) {
    const postcard = postcardsData.find(p => p.id === item.id);
    if (!postcard) return item.price;
    
    const originalPrice = calculatePrice(postcard)[item.size];
    let finalPrice = originalPrice;

    const applicableSales = salesData.filter(s => {
        const now = new Date();
        const isTimeValid = s.noTimeLimit || (s.startDate && s.endDate && now >= new Date(s.startDate) && now <= new Date(s.endDate));
        
        const isTargetValid = (s.targetType === 'group' && s.targetId === postcard.group) || 
                              (s.targetType === 'product' && s.targetId === item.id);
                      
        return isTimeValid && isTargetValid;
    });
    
    if (applicableSales.length > 0) {
         const appliedSale = applicableSales[0]; // Note: Only applies the first found sale for an item
        if (appliedSale.type === 'percent') {
            finalPrice = originalPrice - (originalPrice * (appliedSale.value / 100));
        } else if (appliedSale.type === 'summa') {
            finalPrice = originalPrice - appliedSale.value;
            if (finalPrice < 0) finalPrice = 0;
        }
    }
    return finalPrice;
}

async function renderPostcards() {
    const postcardsList = document.getElementById('postcards-list');
    if (!postcardsList) return;
    
    postcardsList.innerHTML = '';
    
    const groupFilter = document.getElementById('group-filter');
    const selectedGroup = groupFilter ? groupFilter.value : 'all';
    
    // Hämta vilka grupper som ska visas
    const groupsToRender = selectedGroup === 'all'
        ? groupsData
        : groupsData.filter(g => g.id === selectedGroup);
    
    for (const group of groupsToRender) {
        // Filtrera vykort för denna grupp
        let groupPostcards = postcardsData.filter(p => p.group === group.id);
        
        // Om en tagg är vald, filtrera ÄVEN på den
        if (currentTagFilter) {
            groupPostcards = groupPostcards.filter(p => p.tags && p.tags.includes(currentTagFilter));
        }

        if (groupPostcards.length === 0) continue; // Hoppa över tomma grupper eller om filtrering tömde gruppen
        
        const groupSection = document.createElement('div');
        groupSection.innerHTML = `<h2 class="text-3xl font-bold mt-8 mb-4">${group.name}</h2>`;
        
        const postcardsGrid = document.createElement('div');
        postcardsGrid.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start";
        
        // Skapa HTML för vykorten
        if (groupPostcards.length > 0) {
            for (const postcard of groupPostcards) {
                const postcardHtml = await createPostcardHtml(postcard);
                const postcardElement = document.createElement('div');
                postcardElement.innerHTML = postcardHtml;
                postcardsGrid.appendChild(postcardElement.firstElementChild);
            }
        }
        
        groupSection.appendChild(postcardsGrid);
        postcardsList.appendChild(groupSection);
    }
    
    document.querySelectorAll('.postcard-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const postcardId = e.currentTarget.dataset.id;
            openPostcardModal(postcardId);
        });
    });
}

async function createPostcardHtml(p) {
    const priceGroup = priceGroupsData.find(pg => pg.id === p.priceGroup);
    
    let priceHtml = '';
    let hasSale = false;
    
    // Kontrollera om det finns några aktiva reor för denna produkt
    const applicableSales = salesData.filter(s => {
        const now = new Date();
        const isTimeValid = s.noTimeLimit || (s.startDate && s.endDate && now >= new Date(s.startDate) && now <= new Date(s.endDate));
        
        const isTargetValid = (s.targetType === 'group' && s.targetId === p.group) || 
                              (s.targetType === 'product' && s.targetId === p.id);
                      
        return isTimeValid && isTargetValid;
    });
    
    if(applicableSales.length > 0) hasSale = true;

    // Skapa prislistan (HTML)
    if (priceGroup) {
        const sizes = ['liten', 'mellan', 'stor'];
        sizes.forEach((size) => {
            const originalPrice = priceGroup.prices[size];
            const discountedPrice = getDiscountedPrice({ id: p.id, size: size, price: originalPrice });
            
            if (originalPrice !== discountedPrice) {
                priceHtml += `
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-sm">
                            ${size.charAt(0).toUpperCase() + size.slice(1)}:
                            <span class="line-through text-gray-400">${originalPrice} kr</span>
                            <span class="text-red-600 font-bold ml-1">${discountedPrice.toFixed(2)} kr</span>
                        </span>
                    </div>
                `;
            } else {
                priceHtml += `
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-sm">${size.charAt(0).toUpperCase() + size.slice(1)}: ${originalPrice} kr</span>
                    </div>
                `;
            }
        });
    }
    
    const saleBadge = hasSale ? '<span class="ml-2 px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-full">REA!</span>' : '';

    // --- NYTT: Skapa HTML för taggar ---
    let tagsHtml = '';
    if (p.tags && p.tags.length > 0) {
        tagsHtml = '<div class="mt-3 flex flex-wrap justify-center gap-1">';
        p.tags.forEach(tag => {
            // "event.stopPropagation()" är viktigt här för att inte öppna vykortet (modalen) när man klickar på taggen
            tagsHtml += `<span onclick="event.stopPropagation(); window.filterByTag('${tag}')" class="tag-badge">#${tag}</span>`;
        });
        tagsHtml += '</div>';
    }
    // ------------------------------------

    // Returnera ett Promise som väntar på att bilden laddas för att bestämma orientering
    return new Promise(resolve => {
        const image = new Image();
        image.src = p.imageURL;
        image.onload = () => {
            const orientation = image.naturalWidth > image.naturalHeight ? 'landscape' : 'portrait';
            const html = `
                <div class="card flex flex-col items-center text-center cursor-pointer postcard-card" data-id="${p.id}">
                    <div class="postcard-image-wrapper ${orientation} rounded-lg mb-4">
                        <img src="${p.imageURL}" alt="${p.title}" loading="lazy">
                    </div>
                    <h2 class="text-xl font-bold mb-2">${p.title}${saleBadge}</h2>
                    ${priceHtml}
                    ${tagsHtml} </div>
            `;
            resolve(html);
        };
        image.onerror = () => { // Hantera trasiga bilder snyggt
             const html = `
                <div class="card flex flex-col items-center text-center cursor-pointer postcard-card" data-id="${p.id}">
                    <div class="postcard-image-wrapper portrait rounded-lg mb-4 bg-gray-200 flex items-center justify-center">
                       <span class="text-gray-500">Bild saknas</span>
                    </div>
                    <h2 class="text-xl font-bold mb-2">${p.title}${saleBadge}</h2>
                    ${priceHtml}
                    ${tagsHtml}
                </div>
            `;
            resolve(html);
        }
    });
}

function openPostcardModal(postcardId, cartItemIndex = -1) {
    const postcard = postcardsData.find(p => p.id === postcardId);
    if (!postcard) {
        console.error("Vykortet hittades inte:", postcardId);
        return;
    }

    document.getElementById('modal-postcard-id').value = postcard.id;
    document.getElementById('modal-cart-item-index').value = cartItemIndex;
    document.getElementById('modal-title').textContent = postcard.title;
    
    const imageEl = document.getElementById('modal-image');
    const imageWrapper = document.getElementById('modal-image-wrapper');
    imageEl.src = postcard.imageURL;

    const image = new Image();
    image.src = postcard.imageURL;
    image.onload = () => {
        const orientation = image.naturalWidth > image.naturalHeight ? 'landscape' : 'portrait';
        imageWrapper.className = `postcard-image-wrapper ${orientation} rounded-lg mb-4`;
    };

    const pricesEl = document.getElementById('modal-size-options');
    pricesEl.innerHTML = '';
    
    const priceGroup = priceGroupsData.find(pg => pg.id === postcard.priceGroup);
    if (priceGroup) {
        const sizes = ['liten', 'mellan', 'stor'];
        sizes.forEach((size, index) => {
            const originalPrice = priceGroup.prices[size];
            const discountedPrice = getDiscountedPrice({ id: postcard.id, size: size, price: originalPrice });
            
            let priceDisplay = `<span class="font-bold">${discountedPrice.toFixed(2)} kr</span>`;
            if (originalPrice !== discountedPrice) {
                priceDisplay = `<span class="line-through text-gray-400">${originalPrice.toFixed(2)} kr</span>
                                <span class="font-bold ml-1 text-red-600">${discountedPrice.toFixed(2)} kr</span>`;
            }
            
            pricesEl.innerHTML += `
                <div class="flex items-center">
                    <input type="radio" id="size-${size}" name="size" value="${size}" class="mr-2" ${index === 0 ? 'checked' : ''}>
                    <label for="size-${size}" class="flex-1">${size.charAt(0).toUpperCase() + size.slice(1)} (${priceDisplay})</label>
                </div>
            `;
        });
    }

    const form = document.getElementById('add-to-cart-form');
    const submitBtn = form.querySelector('button[type="submit"]');

    if (cartItemIndex !== -1) {
        const itemToEdit = cart[cartItemIndex];
        form.querySelector(`input[value="${itemToEdit.size}"]`).checked = true;
        document.getElementById('modal-recipient-name').value = itemToEdit.recipient.name || '';
        document.getElementById('modal-recipient-address').value = itemToEdit.recipient.address || '';
        document.getElementById('modal-recipient-address2').value = itemToEdit.recipient.address2 || '';
        document.getElementById('modal-recipient-zip').value = itemToEdit.recipient.zip || '';
        document.getElementById('modal-recipient-city').value = itemToEdit.recipient.city || '';
        document.getElementById('modal-recipient-country').value = itemToEdit.recipient.country || '';
        document.getElementById('modal-message-text').value = itemToEdit.message || '';
        submitBtn.textContent = "Uppdatera i varukorgen";
    } else {
        form.reset();
        form.querySelector('input[value="liten"]').checked = true;
        submitBtn.textContent = "Lägg i varukorgen";
    }

    document.getElementById('postcardModal')?.classList.add('active');
}

function addToCart(item) {
    cart.push(item);
    showConfirmationToast();
    saveCart();
    renderCart();
}

function editCartItem(index, newItem) {
    if (index >= 0 && index < cart.length) {
        cart[index] = newItem;
        showConfirmationToast("Vara uppdaterad i varukorgen!");
        saveCart();
        renderCart();
    }
}

function showConfirmationToast(message = "Vara tillagd i varukorgen!") {
    const toast = document.getElementById('confirmation-toast');
    if (toast) {
        toast.textContent = message;
        toast.classList.add('active');
        setTimeout(() => {
            toast.classList.remove('active');
        }, 2000);
    }
}

function showErrorModal(title, message) {
    document.getElementById('error-modal-title').textContent = title;
    document.getElementById('error-modal-message').textContent = message;
    document.getElementById('errorModal').classList.add('active');
}

function saveCart() {
    try {
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartCount();
    } catch (e) {
        console.error("Kunde inte spara varukorgen till localStorage:", e);
    }
}

function updateCartCount() {
    const cartCount = document.getElementById('cart-count');
    if(cartCount) cartCount.textContent = cart.length;
}

function calculateCartTotal() {
    let subtotal = 0;
    cart.forEach(item => {
        const discountedPrice = getDiscountedPrice(item);
        subtotal += discountedPrice;
    });
    
    const now = new Date();
    const applicableSales = salesData.filter(s => 
        s.targetType === 'all' && (s.noTimeLimit || (s.startDate && s.endDate && now >= new Date(s.startDate) && now <= new Date(s.endDate)))
    );
    
    let totalDiscount = 0;
    applicableSales.forEach(s => {
        if (s.type === 'percent') {
            totalDiscount += subtotal * (s.value / 100);
        } else if (s.type === 'summa') {
            totalDiscount += s.value;
        }
    });

    let finalTotal = subtotal - totalDiscount;
    if (finalTotal < 0) finalTotal = 0;

    const roundedTotal = Math.floor(finalTotal);
    const roundingAmount = finalTotal - roundedTotal;

    return { subtotal, totalDiscount, finalTotal, roundedTotal, roundingAmount };
}

function renderCart() {
    const cartItemsEl = document.getElementById('cart-items');
    if (!cartItemsEl) return;
    
    if (cart.length === 0) {
        cartItemsEl.innerHTML = '<p class="text-center text-gray-500">Din varukorg är tom.</p>';
    } else {
        cartItemsEl.innerHTML = ''; // Clear previous items
        cart.forEach((item, index) => {
            const discountedPrice = getDiscountedPrice(item);
            const postcardOriginal = postcardsData.find(p => p.id === item.id);
            const originalPrice = postcardOriginal ? calculatePrice(postcardOriginal)[item.size] : item.price;
            
            let priceDisplay = `<span class="font-bold">${discountedPrice.toFixed(2)} kr</span>`;
            
            if (originalPrice && originalPrice !== discountedPrice) {
                priceDisplay = `<span class="line-through text-gray-400">${originalPrice.toFixed(2)} kr</span>
                                <span class="font-bold ml-1 text-red-600">${discountedPrice.toFixed(2)} kr</span>`;
            }
            
            const recipientText = `${item.recipient.name}, ${item.recipient.address}, ${item.recipient.zip} ${item.recipient.city}, ${item.recipient.country}`;
            const messageText = item.message.substring(0, 50) + (item.message.length > 50 ? '...' : '');

            const itemDiv = document.createElement('div');
            itemDiv.className = "flex flex-col p-2 bg-gray-100 rounded-md";
            itemDiv.innerHTML = `
                <div class="flex items-center justify-between">
                    <p class="font-semibold">${item.title} (${item.size.charAt(0).toUpperCase() + item.size.slice(1)})</p>
                    <div class="flex items-center space-x-2">
                        <button data-postcard-id="${item.id}" data-index="${index}" class="edit-cart-item-btn px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600">Ändra</button>
                        <button data-index="${index}" class="remove-cart-item-btn px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600">Ta bort</button>
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
            `;
            cartItemsEl.appendChild(itemDiv);
        });
    }
    
    document.querySelectorAll('.edit-cart-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const postcardId = e.target.dataset.postcardId;
            const index = parseInt(e.target.dataset.index);
            openPostcardModal(postcardId, index);
        });
    });
    
    document.querySelectorAll('.remove-cart-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            removeFromCart(index);
        });
    });

    const { subtotal, totalDiscount, roundedTotal, roundingAmount } = calculateCartTotal();
    
    document.getElementById('cart-subtotal').textContent = `${subtotal.toFixed(2)} kr`;
    
    const totalDiscountContainer = document.getElementById('cart-total-discount-container');
    if (totalDiscount > 0) {
        totalDiscountContainer.classList.remove('hidden');
        document.getElementById('cart-total-discount').textContent = `-${totalDiscount.toFixed(2)} kr`;
    } else {
        totalDiscountContainer.classList.add('hidden');
    }

    const roundingContainer = document.getElementById('cart-rounding-container');
    if (roundingAmount > 0.001) { // Use a small epsilon to avoid floating point issues
        roundingContainer.classList.remove('hidden');
        document.getElementById('cart-rounding').textContent = `-${roundingAmount.toFixed(2)} kr`;
    } else {
        roundingContainer.classList.add('hidden');
    }

    document.getElementById('cart-total').textContent = `${roundedTotal.toFixed(2)} kr`;
}
    
function removeFromCart(index) {
    if (index >= 0 && index < cart.length) {
        cart.splice(index, 1);
        saveCart();
        renderCart();
    }
}

function clearCart() {
    cart = [];
    saveCart();
    renderCart();
}

window.filterByTag = function(tag) {
    currentTagFilter = tag;
    document.getElementById('active-filters-container').classList.remove('hidden');
    document.getElementById('current-tag-name').textContent = tag;
    
    // Nollställ gruppfiltret om man vill söka i hela butiken, 
    // eller behåll det om man vill söka taggar INOM en grupp. 
    // Här väljer vi att nollställa gruppfiltret för att hitta allt med taggen:
    const groupFilter = document.getElementById('group-filter');
    if(groupFilter) groupFilter.value = 'all';
    
    renderPostcards();
    // Scrolla upp lite så man ser resultatet
    document.getElementById('postcards-list').scrollIntoView({ behavior: 'smooth' });
};

window.clearTagFilter = function() {
    currentTagFilter = null;
    document.getElementById('active-filters-container').classList.add('hidden');
    renderPostcards();
};

function renderCarousel() {
    // 1. Filtrera fram highlight-kort
    highlightPostcards = postcardsData.filter(p => p.isHighlight === true);
    
    const section = document.getElementById('highlight-section');
    const container = document.getElementById('carousel-container');
    const dotsContainer = document.getElementById('carousel-dots');
    
    // Om inga highlights finns, dölj sektionen
    if (highlightPostcards.length === 0) {
        if(section) section.classList.add('hidden');
        return;
    }
    
    if(section) section.classList.remove('hidden');
    container.innerHTML = '';
    dotsContainer.innerHTML = '';
    
    // 2. Skapa slides
    highlightPostcards.forEach((postcard, index) => {
        // Hitta lägsta pris för att visa "Från X kr"
        const priceGroup = priceGroupsData.find(pg => pg.id === postcard.priceGroup);
        const minPrice = priceGroup ? Math.min(priceGroup.prices.liten, priceGroup.prices.mellan, priceGroup.prices.stor) : 0;
        
        const slide = document.createElement('div');
        slide.className = `absolute inset-0 transition-opacity duration-700 ease-in-out flex flex-col md:flex-row items-center justify-center p-8 ${index === 0 ? 'opacity-100 z-1' : 'opacity-0 z-0'}`;
        slide.dataset.index = index;
        
        // Layout: Bild till vänster (eller topp), Text till höger (eller botten)
        // Notera: Vi använder object-contain för att visa hela bilden snyggt
        slide.innerHTML = `
            <div class="w-full md:w-1/2 h-56 md:h-full flex items-center justify-center p-4 cursor-pointer" onclick="window.openPostcardModal('${postcard.id}')">
                <img src="${postcard.imageURL}" alt="${postcard.title}" class="max-h-full max-w-full object-contain drop-shadow-xl hover:scale-105 transition-transform duration-300">
            </div>
            
            <div class="w-full md:w-1/2 text-center md:text-left px-4 pb-8 md:p-6 flex flex-col justify-center h-full">
                <div>
                    <span class="bg-terracotta-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2 inline-block">Utvalt verk</span>
                    
                    <h2 class="text-3xl md:text-5xl font-display font-bold text-charcoal mb-2 md:mb-4 cursor-pointer hover:text-terracotta-600 transition-colors" onclick="window.openPostcardModal('${postcard.id}')">
                        ${postcard.title}
                    </h2>
                    
                    <p class="text-sage-600 text-base md:text-lg mb-4 md:mb-6 max-w-md mx-auto md:mx-0 leading-snug">
                        Ett fantastiskt motiv som gör sig perfekt som vykort. Finns i storlekar A6, A5 och A4.
                    </p>
                    
                    <div class="flex flex-col md:flex-row gap-3 md:gap-4 justify-center md:justify-start items-center">
                        <p class="text-2xl font-bold text-terracotta-700">Från ${minPrice} kr</p>
                        <button onclick="window.openPostcardModal('${postcard.id}')" class="btn-primary px-6 py-2 md:px-8 md:py-3 shadow-lg hover:shadow-xl transform hover:-translate-y-1">
                            Köp nu
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(slide);
        
        // Skapa dots
        const dot = document.createElement('button');
        dot.className = `w-3 h-3 rounded-full transition-all duration-300 ${index === 0 ? 'bg-terracotta-600 w-8' : 'bg-sage-300 hover:bg-sage-400'}`;
        dot.onclick = () => goToSlide(index);
        dotsContainer.appendChild(dot);
    });
    
    // 3. Starta event listeners för knappar
    document.getElementById('carousel-prev').onclick = prevSlide;
    document.getElementById('carousel-next').onclick = nextSlide;
    
    // 4. Starta auto-play
    startCarouselTimer();
    
    // Pausa vid hover
    container.addEventListener('mouseenter', stopCarouselTimer);
    container.addEventListener('mouseleave', startCarouselTimer);
}

function showSlide(index) {
    const slides = document.querySelectorAll('#carousel-container > div');
    const dots = document.querySelectorAll('#carousel-dots > button');
    
    if (index >= slides.length) index = 0;
    if (index < 0) index = slides.length - 1;
    
    currentSlide = index;
    
    slides.forEach((slide, i) => {
        if (i === currentSlide) {
            slide.classList.remove('opacity-0', 'z-0');
            slide.classList.add('opacity-100', 'z-1');
        } else {
            slide.classList.remove('opacity-100', 'z-1');
            slide.classList.add('opacity-0', 'z-0');
        }
    });
    
    dots.forEach((dot, i) => {
        if (i === currentSlide) {
            dot.classList.remove('bg-sage-300', 'w-3');
            dot.classList.add('bg-terracotta-600', 'w-8');
        } else {
            dot.classList.remove('bg-terracotta-600', 'w-8');
            dot.classList.add('bg-sage-300', 'w-3');
        }
    });
}

function nextSlide() {
    showSlide(currentSlide + 1);
}

function prevSlide() {
    showSlide(currentSlide - 1);
}

function goToSlide(index) {
    showSlide(index);
}

function startCarouselTimer() {
    stopCarouselTimer();
    if (highlightPostcards.length > 1) {
        carouselInterval = setInterval(nextSlide, 5000); // Byt var 5:e sekund
    }
}

function stopCarouselTimer() {
    if (carouselInterval) clearInterval(carouselInterval);
}

// Expose functions to the window object for legacy or debugging purposes, but prefer addEventListener
window.openPostcardModal = openPostcardModal;