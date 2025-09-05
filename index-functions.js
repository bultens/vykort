import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, onSnapshot, collection, query, orderBy, where, getDocs, writeBatch, updateDoc, doc, deleteDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";
import { createSwishQrCode } from "./qr.js";

const appId = firebaseConfig.projectId;
const swishNumber = '0702249015';

let db;
let auth;
let postcardsData = [];
let priceGroupsData = [];
let groupsData = [];
let salesData = [];
let cart = [];
let currentUser = null;

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
            
            onAuthStateChanged(auth, (user) => {
                if (user) {
                    currentUser = user;
                    console.log("Användare inloggad:", user.email || user.uid);
                    updateUserStatus(true);
                    renderOrderHistory();
                } else {
                    currentUser = null;
                    console.log("Användare utloggad.");
                    updateUserStatus(false);
                }
            });

            startListeners();
        } catch (e) {
            console.error("Firebase initieringsfel:", e);
            document.getElementById('postcards-list').innerHTML = '<p class="text-center text-red-500">Kunde inte ansluta till databasen.</p>';
        }
    } else {
        document.getElementById('postcards-list').innerHTML = '<p class="text-center text-red-500">Firebase-konfiguration saknas.</p>';
    }

    loadCart();
    
    document.getElementById('group-filter').addEventListener('change', renderPostcards);
    
    document.getElementById('cart-btn').addEventListener('click', () => {
        renderCart();
        document.getElementById('cartModal').classList.add('active');
    });
    document.getElementById('close-cart-modal').addEventListener('click', () => {
        document.getElementById('cartModal').classList.remove('active');
    } );
    window.addEventListener('click', (event) => {
        if (event.target === document.getElementById('cartModal')) {
            document.getElementById('cartModal').classList.remove('active');
        }
    });
    
    document.getElementById('close-postcard-modal').addEventListener('click', () => {
        document.getElementById('postcardModal').classList.remove('active');
    });
    window.addEventListener('click', (event) => {
        if (event.target === document.getElementById('postcardModal')) {
            document.getElementById('postcardModal').classList.remove('active');
        }
    });

    document.getElementById('add-to-cart-form').addEventListener('submit', (e) => {
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
        
        document.getElementById('postcardModal').classList.remove('active');
        form.reset();
    });

    document.getElementById('clear-cart-btn').addEventListener('click', clearCart);
    document.getElementById('checkout-btn').addEventListener('click', () => {
        document.getElementById('cartModal').classList.remove('active');
        document.getElementById('checkoutModal').classList.add('active');
        renderCheckout();
    });
    
    // Handle new checkout flow buttons
    document.getElementById('guest-checkout-btn').addEventListener('click', () => {
        document.getElementById('checkout-start-section').classList.add('hidden');
        document.getElementById('billing-info-section').classList.remove('hidden');
    });
    document.getElementById('login-checkout-btn').addEventListener('click', () => {
        document.getElementById('checkout-start-section').classList.add('hidden');
        document.getElementById('checkout-login-section').classList.remove('hidden');
    });

    // Handle user-related modals and forms
    document.getElementById('login-link').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('userModal').classList.add('active');
    });
    document.getElementById('close-user-modal').addEventListener('click', () => {
        document.getElementById('userModal').classList.remove('active');
    });
    document.getElementById('register-switch').addEventListener('click', () => {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.remove('hidden');
        document.getElementById('register-switch').classList.add('hidden');
        document.getElementById('login-switch').classList.remove('hidden');
        document.getElementById('user-modal-title').textContent = "Skapa konto";
    });
    document.getElementById('login-switch').addEventListener('click', () => {
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('register-switch').classList.remove('hidden');
        document.getElementById('login-switch').classList.add('hidden');
        document.getElementById('user-modal-title').textContent = "Logga in";
    });
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    
    // Handle header logout link
    document.getElementById('user-status').addEventListener('click', async (e) => {
        if (e.target.id === 'logout-link') {
            e.preventDefault();
            await signOut(auth);
            document.getElementById('main-content').classList.remove('hidden');
            document.getElementById('checkoutModal').classList.remove('active');
        }
    });

    // Handle checkout forms
    document.getElementById('checkout-login-form').addEventListener('submit', handleCheckoutLogin);
    document.getElementById('checkout-register-form').addEventListener('submit', handleCheckoutRegister);
    document.getElementById('billing-info-form').addEventListener('submit', handlePlaceOrder);
    document.getElementById('close-checkout-modal').addEventListener('click', () => {
        document.getElementById('checkoutModal').classList.remove('active');
        document.getElementById('main-content').classList.remove('hidden');
    });

    // Handle closing the error modal
    document.getElementById('close-error-modal').addEventListener('click', () => {
        document.getElementById('errorModal').classList.remove('active');
    });
    window.addEventListener('click', (event) => {
        if (event.target === document.getElementById('errorModal')) {
            document.getElementById('errorModal').classList.remove('active');
        }
    });
});

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
        document.getElementById('userModal').classList.remove('active');
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
        
        document.getElementById('userModal').classList.remove('active');
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
    
    const billingInfo = {
        name: document.getElementById('billing-name').value,
        address: document.getElementById('billing-address').value,
        zip: document.getElementById('billing-zip').value,
        city: document.getElementById('billing-city').value,
        mobile: document.getElementById('billing-mobile').value,
        email: document.getElementById('billing-email').value
    };
    
    const cartItemsForOrder = cart.map(item => ({
        id: item.id,
        title: item.title,
        size: item.size,
        price: getDiscountedPrice(item),
        message: item.message,
        recipient: item.recipient,
        status: 'obehandlad'
    }));
    
    const { finalTotal } = calculateCartTotal();
    const roundedTotal = Math.floor(finalTotal);
    
    const orderNumber = Math.floor(10000 + Math.random() * 90000).toString();

    try {
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
            const privateDocRef = await addDoc(collection(db, `artifacts/public/users/${currentUser.uid}/orders`), privateOrderData);
            
            // Uppdatera den publika ordern med det privata order-ID:t
            await updateDoc(docRef, { privateOrderId: privateDocRef.id });

        }
        
        document.getElementById('billing-info-section').classList.add('hidden');
        document.getElementById('order-confirmation-section').classList.remove('hidden');
        document.getElementById('order-id-display').textContent = orderNumber;
        document.getElementById('order-total-display').textContent = roundedTotal.toFixed(2).replace('.', ',');
        
        createSwishQrCode(roundedTotal, orderNumber);
        
        clearCart();
    } catch (e) {
        console.error("Fel vid beställning:", e);
        showErrorModal("Beställningen misslyckades", "Ett fel uppstod när din beställning skulle sparas. Vänligen försök igen.");
    }
}


async function updateUserStatus(isLoggedIn) {
    const userStatusEl = document.getElementById('user-status');
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
        document.getElementById('orders-link').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('main-content').classList.add('hidden');
            document.getElementById('checkoutModal').classList.add('active');
            renderCheckout(true);
        });
    } else {
        userStatusEl.innerHTML = `<a href="#" id="login-link" class="hover:text-gray-300 transition duration-300">Logga in</a>`;
        document.getElementById('login-link').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('userModal').classList.add('active');
        });
    }
}

function renderCheckout(showOrders = false) {
    document.getElementById('checkout-start-section').classList.add('hidden');
    document.getElementById('checkout-login-section').classList.add('hidden');
    document.getElementById('billing-info-section').classList.add('hidden');
    document.getElementById('order-history-section').classList.add('hidden');
    document.getElementById('order-confirmation-section').classList.add('hidden');
    document.getElementById('main-content').classList.add('hidden');


    if (showOrders && currentUser) {
        document.getElementById('order-history-section').classList.remove('hidden');
        renderOrderHistory();
    } else if (currentUser) {
        document.getElementById('billing-info-section').classList.remove('hidden');
        document.getElementById('billing-email').value = currentUser.email;
    } else {
        document.getElementById('checkout-start-section').classList.remove('hidden');
    }
}

async function renderOrderHistory() {
    if (!currentUser) {
        console.log("Ingen användare inloggad, kan inte visa orderhistorik.");
        return;
    }

    const orderHistoryList = document.getElementById('order-history-list');
    orderHistoryList.innerHTML = '';
    
    const ordersRef = collection(db, `artifacts/public/users/${currentUser.uid}/orders`);
    const q = query(ordersRef, orderBy('timestamp', 'desc'));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        orderHistoryList.innerHTML = '<p class="text-gray-500">Inga tidigare ordrar hittades.</p>';
        return;
    }
    
    querySnapshot.forEach(doc => {
        const order = doc.data();
        const orderDiv = document.createElement('div');
        orderDiv.className = 'p-4 bg-gray-100 rounded-lg shadow-sm';
        
        const timestamp = order.timestamp?.toDate ? order.timestamp.toDate().toLocaleString('sv-SE') : 'Okänt datum';
        
        const orderNumberToDisplay = order.orderNumber || order.orderId;

        orderDiv.innerHTML = `
            <h4 class="font-bold text-lg">Order #${orderNumberToDisplay}</h4>
            <p class="text-sm text-gray-600">Datum: ${timestamp}</p>
            <p class="text-sm font-semibold">Status: ${order.status || 'Okänd'}</p>
            <div class="mt-2 space-y-1">
                ${order.items.map(item => `<p class="text-sm">- ${item.title} (${item.size.charAt(0).toUpperCase() + item.size.slice(1)}): ${item.price.toFixed(2)} kr</p>`).join('')}
            </div>
            <p class="mt-2 font-bold text-right">Summa: ${order.total.toFixed(2)} kr</p>
        `;
        orderHistoryList.appendChild(orderDiv);
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
    if (initialDataLoaded.postcards && initialDataLoaded.priceGroups && initialDataLoaded.groups && initialDataLoaded.sales && initialDataLoaded.news) {
        if (!allDataLoaded) {
            renderPostcards();
            renderCart();
            allDataLoaded = true;
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
    newsList.innerHTML = '';
    
    const now = new Date();
    const activeNews = news.filter(item => 
        item.noTimeLimit || (item.startDate && item.endDate && now >= new Date(item.startDate) && now <= new Date(item.endDate))
    );

    if (activeNews.length === 0) {
        document.getElementById('news-section').classList.add('hidden');
        return;
    } else {
        document.getElementById('news-section').classList.remove('hidden');
    }

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


function populateFilters() {
    const groupFilter = document.getElementById('group-filter');

    groupFilter.innerHTML = '<option value="all">Alla Grupper</option>';
    groupsData.forEach(g => {
        const option = document.createElement('option');
        option.value = g.id;
        option.textContent = g.name;
        groupFilter.appendChild(option);
    });
}

function calculatePrice(postcard) {
    const prices = priceGroupsData.find(pg => pg.id === postcard.priceGroup)?.prices;
    return prices || { liten: 0, mellan: 0, stor: 0 };
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
         const appliedSale = applicableSales[0];
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
    postcardsList.innerHTML = '';
    
    const groupsToRender = document.getElementById('group-filter').value === 'all'
        ? groupsData
        : groupsData.filter(g => g.id === document.getElementById('group-filter').value);
    
    const renderedGroups = new Set();
    let allGroupsHtml = '';

    for (const group of groupsToRender) {
        if (renderedGroups.has(group.id)) continue;
        renderedGroups.add(group.id);

        const postcardsInGroup = postcardsData.filter(p => p.group === group.id);
        
        if (postcardsInGroup.length > 0) {
            const postcardHtmlPromises = postcardsInGroup.map(p => createPostcardHtml(p));
            const postcardHtmls = await Promise.all(postcardHtmlPromises);

            let groupSectionHtml = `<h2 class="text-3xl font-bold mt-8 mb-4">${group.name}</h2>`;
            groupSectionHtml += `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">`;
            groupSectionHtml += postcardHtmls.join('');
            groupSectionHtml += `</div>`;
            
            allGroupsHtml += groupSectionHtml;
        }
    }
    
    postcardsList.innerHTML = allGroupsHtml;
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
    
    const applicableSales = salesData.filter(s => {
        const now = new Date();
        const isTimeValid = s.noTimeLimit || (s.startDate && s.endDate && now >= new Date(s.startDate) && now <= new Date(s.endDate));
        
        const isTargetValid = (s.targetType === 'group' && s.targetId === p.group) || 
                              (s.targetType === 'product' && s.targetId === p.id);
                      
        return isTimeValid && isTargetValid;
    });
    
    if(applicableSales.length > 0) hasSale = true;

    if (priceGroup) {
        const sizes = ['liten', 'mellan', 'stor'];
        sizes.forEach((size, index) => {
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

    const image = new Image();
    image.src = p.imageURL;
    await new Promise(resolve => image.onload = resolve);
    const orientation = image.naturalWidth > image.naturalHeight ? 'landscape' : 'portrait';

    return `
        <div class="card flex flex-col items-center text-center cursor-pointer postcard-card" data-id="${p.id}">
            <div class="postcard-image-wrapper ${orientation} rounded-lg mb-4">
                <img src="${p.imageURL}" alt="${p.title}">
            </div>
            <h2 class="text-xl font-bold mb-2">${p.title}${saleBadge}</h2>
            ${priceHtml}
        </div>
    `;
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

    if (cartItemIndex !== -1) {
        const itemToEdit = cart[cartItemIndex];
        document.getElementById(`size-${itemToEdit.size}`).checked = true;
        document.getElementById('modal-recipient-name').value = itemToEdit.recipient.name || '';
        document.getElementById('modal-recipient-address').value = itemToEdit.recipient.address || '';
        document.getElementById('modal-recipient-address2').value = itemToEdit.recipient.address2 || '';
        document.getElementById('modal-recipient-zip').value = itemToEdit.recipient.zip || '';
        document.getElementById('modal-recipient-city').value = itemToEdit.recipient.city || '';
        document.getElementById('modal-recipient-country').value = itemToEdit.recipient.country || '';
        document.getElementById('modal-message-text').value = itemToEdit.message || '';
        document.querySelector('#add-to-cart-form button[type="submit"]').textContent = "Uppdatera i varukorgen";
    } else {
        document.getElementById('add-to-cart-form').reset();
        document.querySelector('#add-to-cart-form button[type="submit"]').textContent = "Lägg i varukorgen";
    }

    document.getElementById('postcardModal').classList.add('active');
}

function addToCart(item) {
    cart.push(item);
    
    showConfirmationToast();
    saveCart();
    renderCart();
}

function editCartItem(index, newItem) {
    cart[index] = newItem;
    showConfirmationToast("Vara uppdaterad i varukorgen!");
    saveCart();
    renderCart();
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

function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
}

function updateCartCount() {
    document.getElementById('cart-count').textContent = cart.length;
}

function calculateCartTotal() {
    let subtotal = 0;
    cart.forEach(item => {
        const discountedPrice = getDiscountedPrice(item);
        subtotal += discountedPrice;
    });
    
    const applicableSales = salesData.filter(s => {
        const now = new Date();
        const isTimeValid = s.noTimeLimit || (s.startDate && s.endDate && now >= new Date(s.startDate) && now <= new Date(s.endDate));
        const isTargetValid = s.targetType === 'all';
        return isTimeValid && isTargetValid;
    });
    
    let totalDiscount = 0;
    let finalTotal = subtotal;

    applicableSales.forEach(s => {
        if (s.type === 'percent') {
            totalDiscount += subtotal * (s.value / 100);
        } else if (s.type === 'summa') {
            totalDiscount += s.value;
        }
    });

    finalTotal = subtotal - totalDiscount;
    if (finalTotal < 0) finalTotal = 0;

    // Calculate rounding
    const roundedTotal = Math.floor(finalTotal);
    const roundingAmount = finalTotal - roundedTotal;

    return { subtotal, totalDiscount, finalTotal, roundedTotal, roundingAmount };
}

function renderCart() {
    const cartItemsEl = document.getElementById('cart-items');
    cartItemsEl.innerHTML = '';
    
    if (cart.length === 0) {
        cartItemsEl.innerHTML = '<p class="text-center text-gray-500">Din varukorg är tom.</p>';
    } else {
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

            cartItemsEl.innerHTML += `
                <div class="flex flex-col p-2 bg-gray-100 rounded-md">
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
                </div>
            `;
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

    const { subtotal, totalDiscount, finalTotal, roundedTotal, roundingAmount } = calculateCartTotal();
    document.getElementById('cart-subtotal').textContent = `${subtotal.toFixed(2)} kr`;
    
    const totalDiscountContainer = document.getElementById('cart-total-discount-container');
    if (totalDiscount > 0) {
        totalDiscountContainer.classList.remove('hidden');
        document.getElementById('cart-total-discount').textContent = `-${totalDiscount.toFixed(2)} kr`;
    } else {
        totalDiscountContainer.classList.add('hidden');
    }

    const roundingContainer = document.getElementById('cart-rounding-container');
    if (roundingAmount > 0) {
        roundingContainer.classList.remove('hidden');
        document.getElementById('cart-rounding').textContent = `-${roundingAmount.toFixed(2)} kr`;
    } else {
        roundingContainer.classList.add('hidden');
    }

    document.getElementById('cart-total').textContent = `${roundedTotal.toFixed(2)} kr`;
}
    
function removeFromCart(index) {
    cart.splice(index, 1);
    saveCart();
    renderCart();
}

function clearCart() {
    cart = [];
    saveCart();
    renderCart();
}

window.openPostcardModal = openPostcardModal;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;