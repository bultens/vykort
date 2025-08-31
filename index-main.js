// index-main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, onSnapshot, collection, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { loadCart, addToCart, editCartItem, removeFromCart, clearCart, renderCart, getCart } from './cart.js';

const firebaseConfig = {
    apiKey: "AIzaSyCorCZf8cH8vD1v47aOADdW3x0hCWlVUfw",
    authDomain: "kumlaskytte.firebaseapp.com",
    projectId: "kumlaskytte",
    storageBucket: "kumlaskytte.firebasestorage.app",
    messagingSenderId: "571676149705",
    appId: "1:571676149705:web:a0ace868f4680298a78a18",
    measurementId: "G-KSJ9NLNDBX"
};

const appId = firebaseConfig.projectId;

let db;
let auth;
let postcardsData = [];
let priceGroupsData = [];
let groupsData = [];
let salesData = [];

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
            signInAnonymously(auth);

            startListeners();
        } catch (e) {
            console.error("Firebase initieringsfel:", e);
            document.getElementById('postcards-list').innerHTML = '<p class="text-center text-red-500">Kunde inte ansluta till databasen.</p>';
        }
    } else {
        document.getElementById('postcards-list').innerHTML = '<p class="text-center text-red-500">Firebase-konfiguration saknas.</p>';
    }

    document.getElementById('group-filter').addEventListener('change', renderPostcards);
    
    document.getElementById('cart-btn').addEventListener('click', () => {
        renderCart();
        document.getElementById('cartModal').classList.add('active');
    });
    document.getElementById('close-cart-modal').addEventListener('click', () => {
        document.getElementById('cartModal').classList.remove('active');
    });
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
            id: postcard.id,
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

        if (cartItemIndex !== "") {
            editCartItem(parseInt(cartItemIndex), newItem);
        } else {
            addToCart(newItem);
        }
        
        document.getElementById('postcardModal').classList.remove('active');
        form.reset();
    });

    document.getElementById('clear-cart-btn').addEventListener('click', clearCart);
});

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

    const productSale = salesData.find(s => s.targetType === 'product' && s.targetId === item.id);
    const groupSale = salesData.find(s => s.targetType === 'group' && s.targetId === postcard.group);
    
    let appliedSale = null;
    if (productSale) {
        appliedSale = productSale;
    } else if (groupSale) {
        appliedSale = groupSale;
    }

    if (appliedSale) {
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
        sizes.forEach(size => {
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
        const cart = getCart();
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

window.openPostcardModal = openPostcardModal;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;