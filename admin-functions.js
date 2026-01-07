// Version 1.01
import { 
    getFirestore, onSnapshot, collection, query, orderBy, where, getDocs, writeBatch, updateDoc, doc, deleteDoc, addDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Modala funktioner
export function showMessage(message) {
    document.getElementById('modal-message').textContent = message;
    document.getElementById('messageModal').classList.add('active');
}

export function showConfirmation(message, onConfirm) {
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirmationModal').classList.add('active');
    
    const confirmBtn = document.getElementById('confirm-yes-btn');
    const cancelBtn = document.getElementById('confirm-no-btn');

    confirmBtn.onclick = () => {
        onConfirm();
        document.getElementById('confirmationModal').classList.remove('active');
    };
    cancelBtn.onclick = () => {
        document.getElementById('confirmationModal').classList.remove('active');
    };
}

// Funktioner för att lägga till data
export async function addPriceGroup(globalState, name, prices) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad för att utföra denna åtgärd.');
    const priceGroupsCollection = collection(globalState.db, `artifacts/${globalState.appId}/public/data/priceGroups`);
    await addDoc(priceGroupsCollection, { name, prices, isDefault: false });
    showMessage('Prisgrupp tillagd!');
}

export async function addGroup(globalState, name, order) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad för att utföra denna åtgärd.');
    const groupsCollection = collection(globalState.db, `artifacts/${globalState.appId}/public/data/groups`);
    await addDoc(groupsCollection, { name, order: Number(order), isDefault: false });
    showMessage('Grupp tillagd!');
}

export async function addOrUpdatePostcard(globalState) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad för att utföra denna åtgärd.');
    const title = document.getElementById('postcard-title').value;
    const imageURL = document.getElementById('postcard-image-url').value;
    const group = document.getElementById('postcard-group').value;
    const priceGroup = document.getElementById('postcard-price-group').value;

    const postcardData = { title, imageURL, group, priceGroup };

    if (globalState.currentEditingPostcardId) {
        await updateDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/postcards`, globalState.currentEditingPostcardId), postcardData);
        showMessage('Vykort uppdaterat!');
        globalState.currentEditingPostcardId = null;
        document.getElementById('add-postcard-btn').textContent = 'Lägg till vykort';
    } else {
        await addDoc(collection(globalState.db, `artifacts/${globalState.appId}/public/data/postcards`), postcardData);
        showMessage('Vykort tillagt!');
    }
    document.getElementById('add-postcard-form').reset();
}

export async function addSale(globalState, name, value, type, targetType, targetId, noTimeLimit, startDate, endDate, timezone) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad för att utföra denna åtgärd.');
    const saleData = {
        name,
        value: Number(value),
        type,
        targetType,
        targetId,
        noTimeLimit,
        startDate,
        endDate,
        timezone
    };
    await addDoc(collection(globalState.db, `artifacts/${globalState.appId}/public/data/sales`), saleData);
    showMessage('Rea tillagd!');
}

export async function addNews(globalState, title, text, order, noTimeLimit, startDate, endDate) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad för att utföra denna åtgärd.');
    const newsData = {
        title,
        text,
        order: Number(order),
        noTimeLimit,
        startDate: noTimeLimit ? null : startDate,
        endDate: noTimeLimit ? null : endDate
    };
    await addDoc(collection(globalState.db, `artifacts/${globalState.appId}/public/data/news`), newsData);
    showMessage('Nyhet tillagd!');
}

// Funktioner för rendering och hantering av UI
export function renderGroupsAndPrices(globalState) {
    const priceGroupSelect = document.getElementById('postcard-price-group');
    const groupSelect = document.getElementById('postcard-group');
    const saleTargetSelect = document.getElementById('sale-target-id');

    priceGroupSelect.innerHTML = '';
    globalState.priceGroupsData.forEach(pg => {
        const option = document.createElement('option');
        option.value = pg.id;
        option.textContent = pg.name;
        priceGroupSelect.appendChild(option);
        if (pg.isDefault) {
            globalState.defaultPriceGroupId = pg.id;
            option.selected = true;
        }
    });

    groupSelect.innerHTML = '';
    saleTargetSelect.innerHTML = '<option value="">Välj...</option>';
    globalState.groupsData.forEach(g => {
        const option = document.createElement('option');
        option.value = g.id;
        option.textContent = `Grupp: ${g.name}`;
        groupSelect.appendChild(option);
        saleTargetSelect.appendChild(option.cloneNode(true));
    });
    globalState.postcardsData.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = `Produkt: ${p.title}`;
        saleTargetSelect.appendChild(option);
    });
}

export function renderAdminLists(globalState) {
   // if (!globalState.isAdminLoggedIn) return;
console.log("Rendering lists with data:", globalState.postcardsData);
    const priceGroupsList = document.getElementById('price-groups-list');
    const groupsList = document.getElementById('groups-list');
    const postcardsList = document.getElementById('postcards-list');
    const adminsList = document.getElementById('admin-list');
    const salesList = document.getElementById('sales-list');
    const newsList = document.getElementById('news-list');
    
    priceGroupsList.innerHTML = '';
    globalState.priceGroupsData.forEach(pg => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-2 bg-gray-100 rounded-md";
        const p = pg.prices || { liten: 0, mellan: 0, stor: 0 }; 
        let pricesText = `(Liten: ${p.liten}, Mellan: ${p.mellan}, Stor: ${p.stor})`;
        
        div.innerHTML = `
            <span>${pg.name} ${pg.isDefault ? ' (Standard)' : ''} ${pricesText}</span>
            <div class="space-x-2">
                <button onclick="window.editPriceGroup('${pg.id}')" class="text-blue-500 hover:text-blue-700">Ändra</button>
                ${globalState.priceGroupsData.length > 1 ? `<button onclick="window.deletePriceGroup('${pg.id}')" class="text-red-500 hover:text-red-700">Ta bort</button>` : ''}
            </div>
        `;
        priceGroupsList.appendChild(div);
    });

    groupsList.innerHTML = '';
    globalState.groupsData.forEach(g => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-2 bg-gray-100 rounded-md";
        div.innerHTML = `
            <span>${g.name} (Ordning: ${g.order}) ${g.isDefault ? ' (Standard)' : ''}</span>
            <div class="space-x-2">
                <button onclick="window.editGroup('${g.id}')" class="text-blue-500 hover:text-blue-700">Ändra</button>
                ${globalState.groupsData.length > 1 ? `<button onclick="window.deleteGroup('${g.id}')" class="text-red-500 hover:text-red-700">Ta bort</button>` : ''}
            </div>
        `;
        groupsList.appendChild(div);
    });

    postcardsList.innerHTML = '';
    globalState.postcardsData.forEach(p => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-4 bg-gray-100 rounded-md";
        const priceGroupName = globalState.priceGroupsData.find(pg => pg.id === p.priceGroup)?.name || 'Okänd';
        const groupName = globalState.groupsData.find(g => g.id === p.group)?.name || 'Okänd';
        div.innerHTML = `
            <div class="flex items-center flex-1">
                <img src="${p.imageURL}" alt="${p.title}" class="postcard-thumbnail">
                <div class="flex-1 space-y-1">
                    <h3 class="font-bold">${p.title}</h3>
                    <p class="text-sm text-gray-600">Grupp: ${groupName}</p>
                    <p class="text-sm text-gray-600">Prisgrupp: ${priceGroupName}</p>
                </div>
            </div>
            <div class="space-x-2 flex-shrink-0">
                <button onclick="window.editPostcard('${p.id}')" class="text-blue-500 hover:text-blue-700">Ändra</button>
                <button onclick="window.deletePostcard('${p.id}')" class="text-red-500 hover:text-red-700">Ta bort</button>
            </div>
        `;
        postcardsList.appendChild(div);
    });
    
    adminsList.innerHTML = '';
    globalState.adminsData.forEach(a => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-2 bg-gray-100 rounded-md";
        div.innerHTML = `
            <span>${a.username}</span>
            <div class="space-x-2">
                ${globalState.adminsData.length > 1 ? `<button onclick="window.deleteAdmin('${a.id}')" class="text-red-500 hover:text-red-700">Ta bort</button>` : ''}
            </div>
        `;
        adminsList.appendChild(div);
    });

    salesList.innerHTML = '';
    globalState.salesData.forEach(s => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-2 bg-gray-100 rounded-md";
        const targetText = s.targetType === 'all' ? 'Hela varukorgen' :
                           s.targetType === 'group' ? `Grupp: ${globalState.groupsData.find(g => g.id === s.targetId)?.name || 'Okänd'}` :
                           `Produkt: ${globalState.postcardsData.find(p => p.id === s.targetId)?.title || 'Okänd'}`;
        const valueText = s.type === 'percent' ? `${s.value}%` : `${s.value} kr`;
        div.innerHTML = `
            <span>${s.name} (${valueText} rabatt på ${targetText})</span>
            <button onclick="window.deleteSale('${s.id}')" class="text-red-500 hover:text-red-700">Ta bort</button>
        `;
        salesList.appendChild(div);
    });

    newsList.innerHTML = '';
    globalState.newsData.forEach(n => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-2 bg-gray-100 rounded-md";
        let dateInfo = '';
        if (!n.noTimeLimit) {
            const start = n.startDate ? new Date(n.startDate).toLocaleString() : 'Ej angivet';
            const end = n.endDate ? new Date(n.endDate).toLocaleString() : 'Ej angivet';
            dateInfo = `(Period: ${start} - ${end})`;
        } else {
            dateInfo = '(Ingen tidsbegränsning)';
        }
        div.innerHTML = `
            <span>${n.title} (Ordning: ${n.order}) ${dateInfo}</span>
            <div class="space-x-2">
                <button onclick="window.editNews('${n.id}')" class="text-blue-500 hover:text-blue-700">Ändra</button>
                <button onclick="window.deleteNews('${n.id}')" class="text-red-500 hover:text-red-700">Ta bort</button>
            </div>
        `;
        newsList.appendChild(div);
    });
}

export function updateAdminStatusBar(orders) {
    const statusCounts = {
        'Ny': 0, 'Väntar': 0, 'Avakta Betalning': 0, 'Betald': 0, 'Skickad': 0, 'Klar': 0
    };
    orders.forEach(order => {
        const status = order.status || 'Ny';
        if (statusCounts[status] !== undefined) {
            statusCounts[status]++;
        }
    });

    document.getElementById('status-Ny').textContent = `Ny: ${statusCounts['Ny']}`;
    document.getElementById('status-Väntar').textContent = `Väntar: ${statusCounts['Väntar']}`;
    document.getElementById('status-Avakta-Betalning').textContent = `Avvakta: ${statusCounts['Avakta Betalning']}`;
    document.getElementById('status-Betald').textContent = `Betald: ${statusCounts['Betald']}`;
    document.getElementById('status-Skickad').textContent = `Skickad: ${statusCounts['Skickad']}`;
    document.getElementById('status-Klar').textContent = `Klar: ${statusCounts['Klar']}`;
}

export async function addAdmin(globalState, username, password) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad för att utföra denna åtgärd.');
    const adminsCollection = collection(globalState.db, `artifacts/${globalState.appId}/public/data/admins`);
    const q = query(adminsCollection, where('username', '==', username));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        showMessage('Användarnamnet finns redan.');
        return;
    }

    await addDoc(adminsCollection, { username, password });
    showMessage('Admin tillagd!');
}

export function startAdminListeners() {
    if (!window.globalState.db) return;
    
    const { db, appId } = window.globalState;
    const { onSnapshot, collection, query, orderBy } = window.globalState.firebase;

    const priceGroupsRef = collection(db, `artifacts/${appId}/public/data/priceGroups`);
    window.globalState.unsubscribePriceGroups = onSnapshot(priceGroupsRef, (snapshot) => {
        window.globalState.priceGroupsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderGroupsAndPrices(window.globalState);
        renderAdminLists(window.globalState);
    });

    const groupsRef = query(collection(db, `artifacts/${appId}/public/data/groups`), orderBy('order'));
    window.globalState.unsubscribeGroups = onSnapshot(groupsRef, (snapshot) => {
        window.globalState.groupsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderGroupsAndPrices(window.globalState);
        renderAdminLists(window.globalState);
    });

    const postcardsRef = collection(db, `artifacts/${appId}/public/data/postcards`);
    window.globalState.unsubscribePostcards = onSnapshot(postcardsRef, (snapshot) => {
        window.globalState.postcardsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAdminLists(window.globalState);
        renderGroupsAndPrices(window.globalState);
    });
    
    const adminsRef = collection(db, `artifacts/${appId}/public/data/admins`);
    window.globalState.unsubscribeAdmins = onSnapshot(adminsRef, (snapshot) => {
        window.globalState.adminsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAdminLists(window.globalState);
    });
    
    const salesRef = collection(db, `artifacts/${appId}/public/data/sales`);
    window.globalState.unsubscribeSales = onSnapshot(salesRef, (snapshot) => {
        window.globalState.salesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAdminLists(window.globalState);
    });
    
    const newsRef = query(collection(db, `artifacts/${appId}/public/data/news`), orderBy('order'));
    window.globalState.unsubscribeNews = onSnapshot(newsRef, (snapshot) => {
        window.globalState.newsData = snapshot.docs.map(doc => {
            const data = doc.data();
            if (data.startDate && data.startDate.toDate) {
                data.startDate = data.startDate.toDate().toISOString().substring(0, 16);
            }
            if (data.endDate && data.endDate.toDate) {
                data.endDate = data.endDate.toDate().toISOString().substring(0, 16);
            }
            return { id: doc.id, ...data };
        });
        renderAdminLists(window.globalState);
    });
    
    const ordersRef = collection(db, `artifacts/${appId}/public/data/orders`);
    window.globalState.unsubscribeOrders = onSnapshot(ordersRef, (snapshot) => {
        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateAdminStatusBar(orders);
    });
}

export function stopAdminListeners() {
    if (window.globalState.unsubscribePriceGroups) window.globalState.unsubscribePriceGroups();
    if (window.globalState.unsubscribeGroups) window.globalState.unsubscribeGroups();
    if (window.globalState.unsubscribePostcards) window.globalState.unsubscribePostcards();
    if (window.globalState.unsubscribeAdmins) window.globalState.unsubscribeAdmins();
    if (window.globalState.unsubscribeSales) window.globalState.unsubscribeSales();
    if (window.globalState.unsubscribeNews) window.globalState.unsubscribeNews();
    if (window.globalState.unsubscribeOrders) window.globalState.unsubscribeOrders();
}

export async function handleLogin(db, appId) {
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;

    if (!db) {
        showMessage("Databasen är inte ansluten.");
        return;
    }

    try {
        const adminsRef = collection(db, `artifacts/${appId}/public/data/admins`);
        const q = query(adminsRef, where('username', '==', username), where('password', '==', password));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            showMessage('Fel: Ogiltiga inloggningsuppgifter.');
            return;
        }
        
        const adminData = querySnapshot.docs[0].data();
        
        window.globalState.isAdminLoggedIn = true;
        
        localStorage.setItem('adminLoggedIn', 'true');
        localStorage.setItem('adminUsername', adminData.username);

        document.getElementById('admin-login-panel').classList.add('hidden');
        document.getElementById('admin-panel').classList.remove('hidden');
        document.getElementById('admin-management-section').classList.remove('hidden');
        document.getElementById('admin-indicator').classList.remove('hidden');
        document.getElementById('admin-user-info').textContent = `Du är inloggad som ${adminData.username}.`;
        
        document.getElementById('orders-link-container').classList.remove('hidden');
        document.getElementById('order-status-summary').classList.remove('hidden');
        
        startAdminListeners();
    } catch (e) {
        console.error("Inloggningsfel:", e);
        showMessage('Ett fel uppstod vid inloggning.');
    }
}

export function handleLogout(globalState) {
    globalState.isAdminLoggedIn = false;
    localStorage.removeItem('adminLoggedIn');
    localStorage.removeItem('adminUsername');

    document.getElementById('admin-login-panel').classList.remove('hidden');
    document.getElementById('admin-panel').classList.add('hidden');
    document.getElementById('admin-management-section').classList.add('hidden');
    document.getElementById('admin-indicator').classList.add('hidden');
    document.getElementById('admin-username').value = '';
    document.getElementById('admin-password').value = '';
    globalState.currentEditingPostcardId = null;
    document.getElementById('add-postcard-btn').textContent = 'Lägg till vykort';
    document.getElementById('add-postcard-form').reset();
    stopAdminListeners();
    document.getElementById('order-status-summary').classList.add('hidden');
    document.getElementById('orders-link-container').classList.add('hidden');
}

export async function editPriceGroup(globalState, id) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad för att utföra denna åtgärd.');
    const pg = globalState.priceGroupsData.find(p => p.id === id);
    if (!pg) {
        showMessage("Prisgruppen hittades inte.");
        return;
    }
    const name = prompt("Ändra namn på prisgrupp:", pg.name);
    const liten = prompt("Ändra pris Liten:", pg.prices.liten);
    const mellan = prompt("Ändra pris Mellan:", pg.prices.mellan);
    const stor = prompt("Ändra pris Stor:", pg.prices.stor);
    if (name && liten && mellan && stor) {
        await updateDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/priceGroups`, id), {
            name,
            prices: { liten: Number(liten), mellan: Number(mellan), stor: Number(stor) }
        });
    }
}

export async function deletePriceGroup(globalState, id) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad för att utföra denna åtgärd.');
    if (globalState.priceGroupsData.length <= 1) {
        showMessage('Kan inte ta bort den sista prisgruppen.');
        return;
    }
    const pg = globalState.priceGroupsData.find(pg => pg.id === id);
    if (pg?.isDefault) {
        showMessage('Kan inte ta bort standardprisgruppen.');
        return;
    }
    const priceGroupsCollection = collection(globalState.db, `artifacts/${globalState.appId}/public/data/priceGroups`);
    const postcardsCollection = collection(globalState.db, `artifacts/${globalState.appId}/public/data/postcards`);
    
    showConfirmation("Är du säker på att du vill ta bort denna prisgrupp? Vykort som använder denna prisgrupp kommer att tilldelas standardprisgruppen.", async () => {
        const batch = writeBatch(globalState.db);
        const q = query(postcardsCollection, where('priceGroup', '==', id));
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => {
            batch.update(doc.ref, { priceGroup: globalState.defaultPriceGroupId });
        });
        batch.delete(doc(priceGroupsCollection, id));
        await batch.commit();
        showMessage('Prisgrupp borttagen och vykort uppdaterade.');
    });
}

export async function editGroup(globalState, id) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad för att utföra denna åtgärd.');
    const g = globalState.groupsData.find(g => g.id === id);
    if (!g) {
        showMessage("Gruppen hittades inte.");
        return;
    }
    const name = prompt("Ändra namn på grupp:", g.name);
    const order = prompt("Ändra ordning på grupp:", g.order);
    if (name && order) {
        await updateDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/groups`, id), { name, order: Number(order) });
    }
}

export async function deleteGroup(globalState, id) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad för att utföra denna åtgärd.');
    if (globalState.groupsData.length <= 1) {
        showMessage('Kan inte ta bort den sista gruppen.');
        return;
    }
    const g = globalState.groupsData.find(g => g.id === id);
    if (g?.isDefault) {
        showMessage('Kan inte ta bort standardgruppen.');
        return;
    }
    const groupsCollection = collection(globalState.db, `artifacts/${globalState.appId}/public/data/groups`);
    const postcardsCollection = collection(globalState.db, `artifacts/${globalState.appId}/public/data/postcards`);

    showConfirmation("Är du säker på att du vill ta bort denna grupp? Vykort som använder denna grupp kommer att tilldelas standardgruppen.", async () => {
        const batch = writeBatch(globalState.db);
        const q = query(postcardsCollection, where('group', '==', id));
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => {
            batch.update(doc.ref, { group: globalState.defaultGroupId });
        });
        batch.delete(doc(groupsCollection, id));
        await batch.commit();
        showMessage('Grupp borttagen och vykort uppdaterade.');
    });
}

export async function editPostcard(globalState, id) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad för att utföra denna åtgärd.');
    const postcard = globalState.postcardsData.find(p => p.id === id);
    if (postcard) {
        document.getElementById('postcard-title').value = postcard.title;
        document.getElementById('postcard-image-url').value = postcard.imageURL;
        document.getElementById('postcard-group').value = postcard.group;
        document.getElementById('postcard-price-group').value = postcard.priceGroup;
        globalState.currentEditingPostcardId = id;
        document.getElementById('add-postcard-btn').textContent = 'Spara ändringar';
    }
}

export async function deletePostcard(globalState, id) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad för att utföra denna åtgärd.');
    showConfirmation("Är du säker på att du vill ta bort detta vykort?", async () => {
        await deleteDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/postcards`, id));
        showMessage('Vykort borttaget.');
    });
}

export async function deleteAdmin(globalState, id) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad för att utföra denna åtgärd.');
    if (globalState.adminsData.length <= 1) {
        showMessage('Kan inte ta bort den sista administratören.');
        return;
    }
    showConfirmation("Är du säker på att du vill ta bort denna admin?", async () => {
        await deleteDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/admins`, id));
        showMessage('Admin borttagen.');
    });
}

export async function deleteSale(globalState, id) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad för att utföra denna åtgärd.');
    showConfirmation("Är du säker på att du vill ta bort denna rea?", async () => {
        await deleteDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/sales`, id));
        showMessage('Rea borttagen.');
    });
}

export async function editNews(globalState, id) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad för att utföra denna åtgärd.');
    const newsItem = globalState.newsData.find(n => n.id === id);
    if (!newsItem) return;

    document.getElementById('edit-news-id').value = newsItem.id;
    document.getElementById('edit-news-title').value = newsItem.title;
    document.getElementById('edit-news-text').value = newsItem.text;
    document.getElementById('edit-news-order').value = newsItem.order;
    
    const noTimeLimitCheckbox = document.getElementById('edit-news-no-time-limit');
    const dateFields = document.getElementById('edit-news-date-fields');
    
    noTimeLimitCheckbox.checked = newsItem.noTimeLimit;
    if (newsItem.noTimeLimit) {
        dateFields.classList.add('hidden');
    } else {
        dateFields.classList.remove('hidden');
        document.getElementById('edit-news-start-date').value = newsItem.startDate || '';
        document.getElementById('edit-news-end-date').value = newsItem.endDate || '';
    }

    document.getElementById('editNewsModal').classList.add('active');
}

export async function deleteNews(globalState, id) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad för att utföra denna åtgärd.');
    showConfirmation("Är du säker på att du vill ta bort denna nyhet?", async () => {
        await deleteDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/news`, id));
        showMessage('Nyhet borttagen.');
    });
}

export async function updateNews(globalState) {
    const id = document.getElementById('edit-news-id').value;
    const title = document.getElementById('edit-news-title').value;
    const text = document.getElementById('edit-news-text').value;
    const order = Number(document.getElementById('edit-news-order').value);
    const noTimeLimit = document.getElementById('edit-news-no-time-limit').checked;
    
    const newsItemExists = globalState.newsData.some(n => n.id === id);
    if (!newsItemExists) {
        showMessage('Fel: Nyheten hittades inte.');
        return;
    }
    
    const newsDataToUpdate = { title, text, order, noTimeLimit };
    if (!noTimeLimit) {
        newsDataToUpdate.startDate = document.getElementById('edit-news-start-date').value;
        newsDataToUpdate.endDate = document.getElementById('edit-news-end-date').value;
    } else {
        if (newsDataToUpdate.startDate) delete newsDataToUpdate.startDate;
        if (newsDataToUpdate.endDate) delete newsDataToUpdate.endDate;
    }

    await updateDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/news`, id), newsDataToUpdate);
    showMessage('Nyhet uppdaterad!');
    document.getElementById('editNewsModal').classList.remove('active');
}