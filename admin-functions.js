// Version 1.5 - Med Admin-kontroll och Auth fix
import { 
    getFirestore, onSnapshot, collection, query, orderBy, where, getDocs, writeBatch, updateDoc, doc, deleteDoc, addDoc, setDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { 
    getStorage, ref, uploadBytes, getDownloadURL 
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { 
    getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

// Modala funktioner
export function showMessage(message) {
    const msgElement = document.getElementById('modal-message');
    const modalElement = document.getElementById('messageModal');
    if (msgElement && modalElement) {
        msgElement.textContent = message;
        modalElement.classList.add('active');
    } else {
        alert(message);
    }
}

export function showConfirmation(message, onConfirm) {
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirmationModal').classList.add('active');
    
    const confirmBtn = document.getElementById('confirm-yes-btn');
    const cancelBtn = document.getElementById('confirm-no-btn');

    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newConfirmBtn.onclick = () => {
        onConfirm();
        document.getElementById('confirmationModal').classList.remove('active');
    };
    newCancelBtn.onclick = () => {
        document.getElementById('confirmationModal').classList.remove('active');
    };
}

// --- DATAHANTERING ---

export async function addPriceGroup(globalState, name, prices) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad.');
    await addDoc(collection(globalState.db, `artifacts/${globalState.appId}/public/data/priceGroups`), { 
        name, prices, isDefault: false 
    });
    showMessage('Prisgrupp tillagd!');
}

export async function addGroup(globalState, name, order) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad.');
    await addDoc(collection(globalState.db, `artifacts/${globalState.appId}/public/data/groups`), { 
        name, order: Number(order), isDefault: false 
    });
    showMessage('Grupp tillagd!');
}

export async function addOrUpdatePostcard(globalState) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad.');
    
    const title = document.getElementById('postcard-title').value;
    const group = document.getElementById('postcard-group').value;
    const priceGroup = document.getElementById('postcard-price-group').value;
    
    const fileInput = document.getElementById('postcard-image-file');
    const existingUrlInput = document.getElementById('existing-image-url');
    const uploadStatus = document.getElementById('upload-status');
    const submitBtn = document.getElementById('add-postcard-btn');

    let imageURL = existingUrlInput.value; 

    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        uploadStatus.classList.remove('hidden');
        submitBtn.disabled = true;
        submitBtn.textContent = "Laddar upp...";

        try {
            const storage = globalState.storage;
            if (!storage) throw new Error("Storage är inte initierat.");

            const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
            const storageRef = ref(storage, `postcards/${Date.now()}_${safeName}`);
            
            const snapshot = await uploadBytes(storageRef, file);
            imageURL = await getDownloadURL(snapshot.ref);
            
        } catch (error) {
            console.error("Uppladdningsfel:", error);
            let errMsg = error.message;
            if (error.code === 'storage/unauthorized') errMsg = 'Behörighet saknas. Är du inloggad?';
            showMessage("Kunde inte ladda upp bilden: " + errMsg);
            uploadStatus.classList.add('hidden');
            submitBtn.disabled = false;
            return; 
        }
    } else if (!imageURL) {
        return showMessage("Du måste välja en bild.");
    }

    const postcardData = { title, imageURL, group, priceGroup };

    try {
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
        document.getElementById('existing-image-url').value = "";
        document.getElementById('image-preview-container').classList.add('hidden');
        document.getElementById('image-preview').src = "";
        uploadStatus.classList.add('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Lägg till vykort';
        
    } catch (e) {
        console.error("Databasfel:", e);
        showMessage("Fel vid sparning till databas.");
        submitBtn.disabled = false;
        uploadStatus.classList.add('hidden');
    }
}

export async function addSale(globalState, name, value, type, targetType, targetId, noTimeLimit, startDate, endDate, timezone) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad.');
    await addDoc(collection(globalState.db, `artifacts/${globalState.appId}/public/data/sales`), { 
        name, value: Number(value), type, targetType, targetId, noTimeLimit, startDate, endDate, timezone 
    });
    showMessage('Rea tillagd!');
}

export async function addNews(globalState, title, text, order, noTimeLimit, startDate, endDate) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad.');
    await addDoc(collection(globalState.db, `artifacts/${globalState.appId}/public/data/news`), { 
        title, text, order: Number(order), noTimeLimit, startDate: noTimeLimit ? null : startDate, endDate: noTimeLimit ? null : endDate 
    });
    showMessage('Nyhet tillagd!');
}

// --- RENDERING ---

export function renderGroupsAndPrices(globalState) {
    const priceGroupSelect = document.getElementById('postcard-price-group');
    const groupSelect = document.getElementById('postcard-group');
    const saleTargetSelect = document.getElementById('sale-target-id');

    if (priceGroupSelect) {
        priceGroupSelect.innerHTML = '<option value="">Välj prisgrupp...</option>';
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
    }

    if (groupSelect && saleTargetSelect) {
        groupSelect.innerHTML = '<option value="">Välj grupp...</option>';
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
}

export async function updateSettings(globalState, swishNumber, swishName) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad.');
    await setDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/settings`, 'swish'), { 
        number: swishNumber, name: swishName 
    }, { merge: true });
    showMessage('Inställningar sparade!');
}

export function renderAdminLists(globalState) {
    const priceGroupsList = document.getElementById('price-groups-list');
    const groupsList = document.getElementById('groups-list');
    const postcardsList = document.getElementById('postcards-list');
    const adminsList = document.getElementById('admin-list');
    const salesList = document.getElementById('sales-list');
    const newsList = document.getElementById('news-list');
    
    const createItem = (html) => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-2 bg-gray-100 rounded-md mb-1";
        div.innerHTML = html;
        return div;
    };

    if (priceGroupsList) {
        priceGroupsList.innerHTML = '';
        globalState.priceGroupsData.forEach(pg => {
            const p = pg.prices || { liten: 0, mellan: 0, stor: 0 }; 
            priceGroupsList.appendChild(createItem(`
                <span>${pg.name} (L:${p.liten}, M:${p.mellan}, S:${p.stor})</span>
                <div class="space-x-2">
                    <button onclick="window.editPriceGroup('${pg.id}')" class="text-blue-500 text-sm">Ändra</button>
                    ${globalState.priceGroupsData.length > 1 ? `<button onclick="window.deletePriceGroup('${pg.id}')" class="text-red-500 text-sm">Ta bort</button>` : ''}
                </div>`));
        });
    }

    if (groupsList) {
        groupsList.innerHTML = '';
        globalState.groupsData.forEach(g => {
            groupsList.appendChild(createItem(`
                <span>${g.name} (Ordning: ${g.order})</span>
                <div class="space-x-2">
                    <button onclick="window.editGroup('${g.id}')" class="text-blue-500 text-sm">Ändra</button>
                    ${globalState.groupsData.length > 1 ? `<button onclick="window.deleteGroup('${g.id}')" class="text-red-500 text-sm">Ta bort</button>` : ''}
                </div>`));
        });
    }

    if (postcardsList) {
        postcardsList.innerHTML = '';
        globalState.postcardsData.forEach(p => {
            const div = document.createElement('div');
            div.className = "flex items-center justify-between p-2 bg-gray-100 rounded-md mb-2";
            div.innerHTML = `
                <div class="flex items-center flex-1">
                    <img src="${p.imageURL}" class="w-10 h-10 object-cover rounded mr-3">
                    <span class="font-medium">${p.title}</span>
                </div>
                <div class="space-x-2">
                    <button onclick="window.editPostcard('${p.id}')" class="text-blue-500 text-sm">Ändra</button>
                    <button onclick="window.deletePostcard('${p.id}')" class="text-red-500 text-sm">Ta bort</button>
                </div>`;
            postcardsList.appendChild(div);
        });
    }

    if (adminsList) {
        adminsList.innerHTML = '';
        globalState.adminsData.forEach(a => {
            adminsList.appendChild(createItem(`
                <span>${a.email || a.username}</span>
                <button onclick="window.deleteAdmin('${a.id}')" class="text-red-500 text-sm">Ta bort</button>`));
        });
    }

    if (salesList) {
        salesList.innerHTML = '';
        globalState.salesData.forEach(s => {
            const val = s.type === 'percent' ? `${s.value}%` : `${s.value} kr`;
            salesList.appendChild(createItem(`
                <span>${s.name} (${val})</span>
                <button onclick="window.deleteSale('${s.id}')" class="text-red-500 text-sm">Ta bort</button>`));
        });
    }

    if (newsList) {
        newsList.innerHTML = '';
        globalState.newsData.forEach(n => {
            newsList.appendChild(createItem(`
                <span>${n.title}</span>
                <div class="space-x-2">
                    <button onclick="window.editNews('${n.id}')" class="text-blue-500 text-sm">Ändra</button>
                    <button onclick="window.deleteNews('${n.id}')" class="text-red-500 text-sm">Ta bort</button>
                </div>`));
        });
    }
}

export function updateAdminStatusBar(orders) {
    const statusCounts = { 'Ny': 0, 'Väntar': 0, 'Avakta Betalning': 0, 'Betald': 0, 'Skickad': 0, 'Klar': 0 };
    orders.forEach(order => {
        const status = order.status || 'Ny';
        if (statusCounts[status] !== undefined) statusCounts[status]++;
    });
    for (const [key, value] of Object.entries(statusCounts)) {
        const el = document.getElementById(`status-${key.replace(' ', '-')}`);
        if (el) el.textContent = `${key}: ${value}`;
    }
}

export async function addAdmin(globalState, username, password) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad.');
    // Här sparar vi numera 'email' eftersom vi använder Firebase Auth
    await addDoc(collection(globalState.db, `artifacts/${globalState.appId}/public/data/admins`), { 
        email: username, // Vi antar att användarnamn är email i nya systemet
        addedBy: 'Admin',
        timestamp: new Date()
    });
    showMessage('Admin tillagd i VIP-listan. (OBS: Skapa även kontot i Firebase Console om det inte finns!)');
}

export function startAdminListeners() {
    if (!window.globalState.db) return;
    const { db, appId } = window.globalState;

    const collections = [
        { key: 'priceGroups', ref: collection(db, `artifacts/${appId}/public/data/priceGroups`), dataKey: 'priceGroupsData' },
        { key: 'groups', ref: query(collection(db, `artifacts/${appId}/public/data/groups`), orderBy('order')), dataKey: 'groupsData' },
        { key: 'postcards', ref: collection(db, `artifacts/${appId}/public/data/postcards`), dataKey: 'postcardsData' },
        { key: 'admins', ref: collection(db, `artifacts/${appId}/public/data/admins`), dataKey: 'adminsData' },
        { key: 'sales', ref: collection(db, `artifacts/${appId}/public/data/sales`), dataKey: 'salesData' },
        { key: 'orders', ref: collection(db, `artifacts/${appId}/public/data/orders`), dataKey: 'ordersData', custom: true }
    ];

    window.globalState.unsubscribePriceGroups = onSnapshot(collections[0].ref, (s) => {
        window.globalState.priceGroupsData = s.docs.map(d => ({ id: d.id, ...d.data() }));
        renderGroupsAndPrices(window.globalState); renderAdminLists(window.globalState);
    });
    window.globalState.unsubscribeGroups = onSnapshot(collections[1].ref, (s) => {
        window.globalState.groupsData = s.docs.map(d => ({ id: d.id, ...d.data() }));
        renderGroupsAndPrices(window.globalState); renderAdminLists(window.globalState);
    });
    window.globalState.unsubscribePostcards = onSnapshot(collections[2].ref, (s) => {
        window.globalState.postcardsData = s.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAdminLists(window.globalState); renderGroupsAndPrices(window.globalState);
    });
    window.globalState.unsubscribeAdmins = onSnapshot(collections[3].ref, (s) => {
        window.globalState.adminsData = s.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAdminLists(window.globalState);
    });
    window.globalState.unsubscribeSales = onSnapshot(collections[4].ref, (s) => {
        window.globalState.salesData = s.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAdminLists(window.globalState);
    });
    window.globalState.unsubscribeOrders = onSnapshot(collections[5].ref, (s) => {
        const orders = s.docs.map(d => ({ id: d.id, ...d.data() }));
        updateAdminStatusBar(orders);
    });

    window.globalState.unsubscribeNews = onSnapshot(query(collection(db, `artifacts/${appId}/public/data/news`), orderBy('order')), (s) => {
        window.globalState.newsData = s.docs.map(d => {
            const data = d.data();
            if (data.startDate?.toDate) data.startDate = data.startDate.toDate().toISOString().substring(0, 16);
            if (data.endDate?.toDate) data.endDate = data.endDate.toDate().toISOString().substring(0, 16);
            return { id: d.id, ...data };
        });
        renderAdminLists(window.globalState);
    });

    onSnapshot(doc(db, `artifacts/${appId}/public/data/settings`, 'swish'), (d) => {
        if (d.exists()) {
            document.getElementById('setting-swish-number').value = d.data().number || '';
            document.getElementById('setting-swish-name').value = d.data().name || '';
        }
    });
}

export function stopAdminListeners() {
    const keys = ['PriceGroups', 'Groups', 'Postcards', 'Admins', 'Sales', 'News', 'Orders'];
    keys.forEach(key => {
        if (window.globalState[`unsubscribe${key}`]) window.globalState[`unsubscribe${key}`]();
    });
}

// INLOGGNING - Med Admin-kontroll
export async function handleLogin(globalState) {
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;

    if (!email || !password) return showMessage("Fyll i både e-post och lösenord.");

    try {
        const auth = getAuth(); 
        // 1. Logga in i Firebase Auth (Portvakten)
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. Kolla VIP-listan (Är jag Admin?)
        const db = globalState.db || getFirestore();
        const adminsRef = collection(db, `artifacts/${globalState.appId}/public/data/admins`);
        
        // Vi söker efter ett dokument där fältet 'email' matchar inloggad e-post
        const q = query(adminsRef, where("email", "==", user.email));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            // Inloggad men inte admin -> Kasta ut
            await signOut(auth);
            showMessage("Du har inte behörighet att vara här. (Din email finns inte i admin-listan).");
            return;
        }

        // 3. Allt ok!
        globalState.isAdminLoggedIn = true;
        
    } catch (e) {
        console.error("Inloggningsfel:", e);
        
        // Specifika felmeddelanden
        let msg = `Ett fel uppstod: ${e.message}`;
        if (e.code === 'auth/invalid-email') msg = 'Ogiltig e-postadress.';
        if (e.code === 'auth/user-not-found') msg = 'Användaren finns inte i systemet.';
        if (e.code === 'auth/wrong-password') msg = 'Fel lösenord.';
        if (e.code === 'auth/invalid-credential') msg = 'Fel e-post eller lösenord. Kontrollera stavning.';
        
        showMessage(msg);
    }
}

export async function handleLogout(globalState) {
    try {
        const auth = getAuth();
        await signOut(auth);
        globalState.isAdminLoggedIn = false;
        document.getElementById('admin-email').value = '';
        document.getElementById('admin-password').value = '';
        stopAdminListeners();
    } catch (e) {
        console.error("Utloggningsfel:", e);
    }
}

// ... Resten av funktionerna (edit/delete) är oförändrade från version 1.4 ...
export async function editPriceGroup(globalState, id) {
    const pg = globalState.priceGroupsData.find(p => p.id === id);
    if (!pg) return;
    const name = prompt("Ändra namn:", pg.name);
    const lit = prompt("Pris Liten:", pg.prices.liten);
    const mel = prompt("Pris Mellan:", pg.prices.mellan);
    const stor = prompt("Pris Stor:", pg.prices.stor);
    if (name) await updateDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/priceGroups`, id), {
        name, prices: { liten: Number(lit), mellan: Number(mel), stor: Number(stor) }
    });
}
export async function deletePriceGroup(globalState, id) {
    if(globalState.priceGroupsData.length<=1 || globalState.priceGroupsData.find(p=>p.id===id)?.isDefault) return showMessage('Kan ej ta bort.');
    showConfirmation("Ta bort? Vykort flyttas till std.", async () => {
        const batch = writeBatch(globalState.db);
        const q = query(collection(globalState.db, `artifacts/${globalState.appId}/public/data/postcards`), where('priceGroup', '==', id));
        const s = await getDocs(q);
        s.forEach(d => batch.update(d.ref, { priceGroup: globalState.defaultPriceGroupId }));
        batch.delete(doc(globalState.db, `artifacts/${globalState.appId}/public/data/priceGroups`, id));
        await batch.commit();
        showMessage('Borttagen.');
    });
}
export async function editGroup(globalState, id) {
    const g = globalState.groupsData.find(x => x.id === id);
    const name = prompt("Namn:", g.name);
    const order = prompt("Ordning:", g.order);
    if (name) await updateDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/groups`, id), { name, order: Number(order) });
}
export async function deleteGroup(globalState, id) {
    if(globalState.groupsData.length<=1 || globalState.groupsData.find(g=>g.id===id)?.isDefault) return showMessage('Kan ej ta bort.');
    showConfirmation("Ta bort? Vykort flyttas till std.", async () => {
        const batch = writeBatch(globalState.db);
        const q = query(collection(globalState.db, `artifacts/${globalState.appId}/public/data/postcards`), where('group', '==', id));
        const s = await getDocs(q);
        s.forEach(d => batch.update(d.ref, { group: globalState.defaultGroupId }));
        batch.delete(doc(globalState.db, `artifacts/${globalState.appId}/public/data/groups`, id));
        await batch.commit();
        showMessage('Borttagen.');
    });
}
export async function editPostcard(globalState, id) {
    const postcard = globalState.postcardsData.find(p => p.id === id);
    if (!postcard) return;
    document.getElementById('postcard-title').value = postcard.title;
    document.getElementById('postcard-group').value = postcard.group;
    document.getElementById('postcard-price-group').value = postcard.priceGroup;
    document.getElementById('existing-image-url').value = postcard.imageURL;
    document.getElementById('image-preview').src = postcard.imageURL;
    document.getElementById('image-preview-container').classList.remove('hidden');
    globalState.currentEditingPostcardId = id;
    document.getElementById('add-postcard-btn').textContent = 'Spara ändringar';
    document.getElementById('add-postcard-form').scrollIntoView({ behavior: 'smooth' });
}
export async function deletePostcard(globalState, id) {
    showConfirmation("Ta bort vykort?", async () => {
        await deleteDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/postcards`, id));
        showMessage('Borttaget.');
    });
}
export async function deleteAdmin(globalState, id) {
    showConfirmation("Ta bort admin från listan?", async () => {
        await deleteDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/admins`, id));
        showMessage('Borttagen.');
    });
}
export async function deleteSale(globalState, id) {
    showConfirmation("Ta bort rea?", async () => {
        await deleteDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/sales`, id));
        showMessage('Borttagen.');
    });
}
export async function deleteNews(globalState, id) {
    showConfirmation("Ta bort nyhet?", async () => {
        await deleteDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/news`, id));
        showMessage('Borttagen.');
    });
}
export async function editNews(globalState, id) {
    const n = globalState.newsData.find(x => x.id === id);
    if (!n) return;
    document.getElementById('edit-news-id').value = n.id;
    document.getElementById('edit-news-title').value = n.title;
    document.getElementById('edit-news-text').value = n.text;
    document.getElementById('edit-news-order').value = n.order;
    document.getElementById('edit-news-no-time-limit').checked = n.noTimeLimit;
    document.getElementById('edit-news-date-fields').classList.toggle('hidden', n.noTimeLimit);
    if (!n.noTimeLimit) {
        document.getElementById('edit-news-start-date').value = n.startDate || '';
        document.getElementById('edit-news-end-date').value = n.endDate || '';
    }
    document.getElementById('editNewsModal').classList.add('active');
}
export async function updateNews(globalState) {
    const id = document.getElementById('edit-news-id').value;
    const title = document.getElementById('edit-news-title').value;
    const text = document.getElementById('edit-news-text').value;
    const order = Number(document.getElementById('edit-news-order').value);
    const noTimeLimit = document.getElementById('edit-news-no-time-limit').checked;
    const data = { title, text, order, noTimeLimit, startDate: noTimeLimit?null:document.getElementById('edit-news-start-date').value, endDate: noTimeLimit?null:document.getElementById('edit-news-end-date').value };
    await updateDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/news`, id), data);
    showMessage('Uppdaterad!');
    document.getElementById('editNewsModal').classList.remove('active');
}