// admin-functions.js - Version 2.0 (Highlight & Messages added)
import { 
    getFirestore, onSnapshot, collection, query, orderBy, where, getDocs, writeBatch, updateDoc, doc, deleteDoc, addDoc, setDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { 
    getStorage, ref, uploadBytes, getDownloadURL 
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { 
    getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

// --- MODAL & HJÄLPFUNKTIONER ---
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
    
    // Klona för att rensa gamla event listeners
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

// --- SÄKER INLOGGNING ---

export async function handleLogin(globalState) {
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;

    if (!email || !password) return showMessage("Fyll i både e-post och lösenord.");

    try {
        const auth = getAuth(); 
        
        // 1. Logga in användaren
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. KONTROLLERA OM ADMIN (VIP-listan)
        const db = globalState.db || getFirestore();
        const adminsRef = collection(db, `artifacts/${globalState.appId}/public/data/admins`);
        const q = query(adminsRef, where("email", "==", user.email));
        
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            console.warn("Obehörig inloggning stoppad:", user.email);
            await signOut(auth);
            showMessage("Behörighet saknas. Ditt konto har inte administratörsrättigheter.");
            return;
        }

        console.log("Admin identifierad och inloggad:", user.email);
        globalState.isAdminLoggedIn = true;
        
    } catch (e) {
        console.error("Inloggningsfel:", e);
        let msg = 'Ett fel uppstod vid inloggning.';
        if (e.code === 'auth/invalid-email') msg = 'Ogiltig e-postadress.';
        if (e.code === 'auth/user-not-found') msg = 'Användaren finns inte.';
        if (e.code === 'auth/wrong-password') msg = 'Fel lösenord.';
        if (e.code === 'auth/invalid-credential') msg = 'Fel uppgifter. Kontrollera lösenord och e-post.';
        showMessage(msg);
    }
}

export async function handleLogout(globalState) {
    try {
        const auth = getAuth();
        await signOut(auth);
        globalState.isAdminLoggedIn = false;
        
        // Rensa fält
        const emailEl = document.getElementById('admin-email');
        const passEl = document.getElementById('admin-password');
        if(emailEl) emailEl.value = '';
        if(passEl) passEl.value = '';
        
        stopAdminListeners();
    } catch (e) {
        console.error("Utloggningsfel:", e);
    }
}

// --- DATAHANTERING (CRUD) ---

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
    const tagsInput = document.getElementById('postcard-tags').value;
    const tags = tagsInput.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0);
    
    // NYTT: Hämta highlight-status
    const isHighlight = document.getElementById('postcard-highlight').checked;

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
            if (!storage) throw new Error("Storage ej initierat.");
            const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
            const storageRef = ref(storage, `postcards/${Date.now()}_${safeName}`);
            const snapshot = await uploadBytes(storageRef, file);
            imageURL = await getDownloadURL(snapshot.ref);
        } catch (error) {
            console.error("Uppladdningsfel:", error);
            let errMsg = error.message;
            if (error.code === 'storage/unauthorized') errMsg = 'Behörighet saknas.';
            showMessage("Kunde inte ladda upp bilden: " + errMsg);
            uploadStatus.classList.add('hidden');
            submitBtn.disabled = false;
            return; 
        }
    } else if (!imageURL) {
        return showMessage("Du måste välja en bild.");
    }

    // NYTT: Vi sparar isHighlight i objektet
    const postcardData = { title, tags, isHighlight, imageURL, group, priceGroup };

    try {
        const colRef = collection(globalState.db, `artifacts/${globalState.appId}/public/data/postcards`);
        if (globalState.currentEditingPostcardId) {
            await updateDoc(doc(colRef, globalState.currentEditingPostcardId), postcardData);
            showMessage('Vykort uppdaterat!');
            globalState.currentEditingPostcardId = null;
            document.getElementById('add-postcard-btn').textContent = 'Lägg till vykort';
        } else {
            await addDoc(colRef, postcardData);
            showMessage('Vykort tillagt!');
        }
        document.getElementById('add-postcard-form').reset();
        document.getElementById('existing-image-url').value = "";
        document.getElementById('image-preview-container').classList.add('hidden');
        document.getElementById('image-preview').src = "";
        uploadStatus.classList.add('hidden');
        submitBtn.disabled = false;
    } catch (e) {
        console.error("Databasfel:", e);
        showMessage("Sparfel: " + e.message);
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

export async function addAdmin(globalState, email, password) {
    if (!globalState.isAdminLoggedIn) return showMessage('Du måste vara inloggad.');
    await addDoc(collection(globalState.db, `artifacts/${globalState.appId}/public/data/admins`), { 
        email: email, 
        addedAt: new Date() 
    });
    showMessage('Admin tillagd i VIP-listan!');
}

// --- RENDERING & LISTENERS ---

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
            if (pg.isDefault) option.selected = true;
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
    // NYTT: Helper för att skapa list-items med olika utseende
    const createItem = (itemData) => {
        const div = document.createElement('div');
        // Om det är ett meddelande, använd lite annan styling (box), annars default (rad)
        if (itemData.html.includes('whitespace-pre-wrap')) {
            div.className = "p-3 rounded-md mb-2 " + (itemData.html.includes('border-terracotta') ? "bg-white border border-gray-200 border-l-4 border-terracotta-600" : "bg-gray-100");
        } else {
            div.className = "flex justify-between items-center p-2 bg-gray-100 rounded-md mb-1";
        }
        div.innerHTML = itemData.html;
        return div;
    };

    const lists = {
        'price-groups-list': globalState.priceGroupsData.map(pg => ({
            html: `<span>${pg.name} (L:${pg.prices?.liten}, M:${pg.prices?.mellan}, S:${pg.prices?.stor})</span>
                   <div class="space-x-2"><button onclick="window.editPriceGroup('${pg.id}')" class="text-blue-500 text-sm">Ändra</button>
                   ${globalState.priceGroupsData.length > 1 ? `<button onclick="window.deletePriceGroup('${pg.id}')" class="text-red-500 text-sm">Ta bort</button>` : ''}</div>`
        })),
        'groups-list': globalState.groupsData.map(g => ({
            html: `<span>${g.name} (Ord: ${g.order})</span>
                   <div class="space-x-2"><button onclick="window.editGroup('${g.id}')" class="text-blue-500 text-sm">Ändra</button>
                   ${globalState.groupsData.length > 1 ? `<button onclick="window.deleteGroup('${g.id}')" class="text-red-500 text-sm">Ta bort</button>` : ''}</div>`
        })),
        'admin-list': globalState.adminsData.map(a => ({
            html: `<span>${a.email || a.username || 'Okänd'}</span>
                   <button onclick="window.deleteAdmin('${a.id}')" class="text-red-500 text-sm">Ta bort</button>`
        })),
        'sales-list': globalState.salesData.map(s => ({
            html: `<span>${s.name} (${s.type==='percent' ? s.value+'%' : s.value+'kr'})</span>
                   <button onclick="window.deleteSale('${s.id}')" class="text-red-500 text-sm">Ta bort</button>`
        })),
        'news-list': globalState.newsData.map(n => ({
            html: `<span>${n.title}</span><div class="space-x-2">
                   <button onclick="window.editNews('${n.id}')" class="text-blue-500 text-sm">Ändra</button>
                   <button onclick="window.deleteNews('${n.id}')" class="text-red-500 text-sm">Ta bort</button></div>`
        })),
        // NYTT: Lista för meddelanden
        'messages-list': globalState.messagesData.map(m => {
            const date = m.timestamp?.toDate ? m.timestamp.toDate().toLocaleString('sv-SE').slice(0, 16) : 'Nyss';
            const bgClass = m.read ? 'bg-gray-50' : 'bg-white border-l-4 border-terracotta-600 shadow-sm';
            const fontClass = m.read ? 'text-gray-500' : 'text-charcoal font-medium';
            const borderMarker = !m.read ? 'border-terracotta' : '';
            
            return {
                html: `
                <div class="flex flex-col gap-1 w-full ${borderMarker}">
                    <div class="flex justify-between items-start">
                        <span class="text-xs text-sage-600">${date}</span>
                        <div class="space-x-2">
                            <a href="mailto:${m.email}" class="text-blue-500 text-xs hover:underline">Svara</a>
                            <button onclick="window.deleteMessage('${m.id}')" class="text-red-500 text-xs hover:text-red-700">Ta bort</button>
                        </div>
                    </div>
                    <div class="${fontClass}">${m.name} <span class="text-xs font-normal text-gray-500">&lt;${m.email}&gt;</span></div>
                    <p class="text-sm mt-1 whitespace-pre-wrap">${m.message}</p>
                    ${!m.read ? `<button onclick="window.markMessageRead('${m.id}')" class="text-xs text-terracotta-600 hover:underline mt-2 text-left">Markera som läst</button>` : ''}
                </div>`
            };
        })
    };

    for (const [id, items] of Object.entries(lists)) {
        const el = document.getElementById(id);
        if (el) { el.innerHTML = ''; items.forEach(item => el.appendChild(createItem(item))); }
    }

    // NYTT: Uppdatera badge för olästa meddelanden
    const unreadCount = globalState.messagesData.filter(m => !m.read).length;
    const badge = document.getElementById('unread-count');
    if (badge) {
        badge.textContent = `${unreadCount} nya`;
        if (unreadCount > 0) badge.classList.remove('hidden');
        else badge.classList.add('hidden');
    }

    const postcardsList = document.getElementById('postcards-list');
    if (postcardsList) {
        postcardsList.innerHTML = '';
        globalState.postcardsData.forEach(p => {
            const div = document.createElement('div');
            div.className = "flex items-center justify-between p-2 bg-gray-100 rounded-md mb-2";
            div.innerHTML = `<div class="flex items-center flex-1"><img src="${p.imageURL}" class="w-10 h-10 object-cover rounded mr-3"><span class="font-medium">${p.title}</span></div>
                             <div class="space-x-2"><button onclick="window.editPostcard('${p.id}')" class="text-blue-500 text-sm">Ändra</button>
                             <button onclick="window.deletePostcard('${p.id}')" class="text-red-500 text-sm">Ta bort</button></div>`;
            postcardsList.appendChild(div);
        });
    }
}

export function updateAdminStatusBar(orders) {
    const statusCounts = { 'Ny': 0, 'Väntar': 0, 'Avakta Betalning': 0, 'Betald': 0, 'Skickad': 0, 'Klar': 0 };
    orders.forEach(o => { if (statusCounts[o.status] !== undefined) statusCounts[o.status]++; });
    for (const [key, value] of Object.entries(statusCounts)) {
        const el = document.getElementById(`status-${key.replace(' ', '-')}`);
        if (el) el.textContent = `${key}: ${value}`;
    }
}

export function startAdminListeners() {
    if (!window.globalState.db) return;
    const { db, appId } = window.globalState;

    // NYTT: Lade till 'messages' i listan
    const collections = [
        { name: 'priceGroups', col: 'priceGroups', state: 'priceGroupsData' },
        { name: 'groups', col: 'groups', state: 'groupsData', order: 'order' },
        { name: 'postcards', col: 'postcards', state: 'postcardsData' },
        { name: 'admins', col: 'admins', state: 'adminsData' },
        { name: 'sales', col: 'sales', state: 'salesData' },
        { name: 'orders', col: 'orders', state: 'ordersData', custom: true },
        { name: 'messages', col: 'messages', state: 'messagesData', order: 'timestamp', desc: true }
    ];

    collections.forEach(c => {
        let q = collection(db, `artifacts/${appId}/public/data/${c.col}`);
        
        // Uppdaterad logik för sortering (stigande eller fallande)
        if (c.order) q = query(q, orderBy(c.order, c.desc ? 'desc' : 'asc'));
        
        window.globalState[`unsubscribe${c.name}`] = onSnapshot(q, (s) => {
            if (c.custom && c.name === 'orders') {
                updateAdminStatusBar(s.docs.map(d => ({id:d.id, ...d.data()})));
            } else {
                window.globalState[c.state] = s.docs.map(d => ({id:d.id, ...d.data()}));
                renderGroupsAndPrices(window.globalState); renderAdminLists(window.globalState);
            }
        });
    });

    // News separat
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
        if(d.exists()) {
            document.getElementById('setting-swish-number').value = d.data().number || '';
            document.getElementById('setting-swish-name').value = d.data().name || '';
        }
    });
}

export function stopAdminListeners() {
    // NYTT: Lade till 'messages' i listan för att stoppa lyssnaren
    ['priceGroups', 'groups', 'postcards', 'admins', 'sales', 'news', 'orders', 'messages'].forEach(k => {
        const func = window.globalState[`unsubscribe${k}`];
        if (func) func();
    });
}

// --- REDIGERA & RADERA (WRAPPERS) ---
export async function editPriceGroup(globalState, id) {
    const pg = globalState.priceGroupsData.find(p => p.id === id);
    if (!pg) return;
    const name = prompt("Namn:", pg.name);
    const l = prompt("Pris Liten:", pg.prices.liten), m = prompt("Pris Mellan:", pg.prices.mellan), s = prompt("Pris Stor:", pg.prices.stor);
    if(name) await updateDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/priceGroups`, id), {name, prices:{liten:Number(l), mellan:Number(m), stor:Number(s)}});
}
export async function deletePriceGroup(globalState, id) {
    if(globalState.priceGroupsData.length<=1 || globalState.priceGroupsData.find(p=>p.id===id)?.isDefault) return showMessage('Kan ej ta bort.');
    showConfirmation("Ta bort? Vykort flyttas.", async () => {
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
    const n = prompt("Namn:", g.name), o = prompt("Ordning:", g.order);
    if(n) await updateDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/groups`, id), {name:n, order:Number(o)});
}
export async function deleteGroup(globalState, id) {
    if(globalState.groupsData.length<=1 || globalState.groupsData.find(g=>g.id===id)?.isDefault) return showMessage('Kan ej ta bort.');
    showConfirmation("Ta bort?", async () => {
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
    const p = globalState.postcardsData.find(x => x.id === id);
    if(!p) return;
    document.getElementById('postcard-title').value = p.title;
    document.getElementById('postcard-tags').value = p.tags ? p.tags.join(', ') : '';
    
    // NYTT: Läs in checkbox för highlight
    document.getElementById('postcard-highlight').checked = p.isHighlight || false;
    
    document.getElementById('postcard-group').value = p.group;
    document.getElementById('postcard-price-group').value = p.priceGroup;
    document.getElementById('existing-image-url').value = p.imageURL;
    document.getElementById('image-preview').src = p.imageURL;
    document.getElementById('image-preview-container').classList.remove('hidden');
    globalState.currentEditingPostcardId = id;
    document.getElementById('add-postcard-btn').textContent = 'Spara ändringar';
    document.getElementById('add-postcard-form').scrollIntoView({behavior:'smooth'});
}
export async function deletePostcard(globalState, id) {
    showConfirmation("Ta bort?", async () => await deleteDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/postcards`, id)));
}
export async function deleteAdmin(globalState, id) {
    showConfirmation("Ta bort admin?", async () => await deleteDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/admins`, id)));
}
export async function deleteSale(globalState, id) {
    showConfirmation("Ta bort rea?", async () => await deleteDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/sales`, id)));
}
export async function deleteNews(globalState, id) {
    showConfirmation("Ta bort nyhet?", async () => await deleteDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/news`, id)));
}
export async function editNews(globalState, id) {
    const n = globalState.newsData.find(x => x.id === id);
    if(!n) return;
    document.getElementById('edit-news-id').value = n.id;
    document.getElementById('edit-news-title').value = n.title;
    document.getElementById('edit-news-text').value = n.text;
    document.getElementById('edit-news-order').value = n.order;
    document.getElementById('edit-news-no-time-limit').checked = n.noTimeLimit;
    document.getElementById('edit-news-date-fields').classList.toggle('hidden', n.noTimeLimit);
    if(!n.noTimeLimit) {
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
    const d = { title, text, order, noTimeLimit, startDate: noTimeLimit?null:document.getElementById('edit-news-start-date').value, endDate: noTimeLimit?null:document.getElementById('edit-news-end-date').value };
    await updateDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/news`, id), d);
    showMessage('Uppdaterad!');
    document.getElementById('editNewsModal').classList.remove('active');
}

// NYTT: Funktioner för meddelanden
export async function deleteMessage(globalState, id) {
    showConfirmation("Ta bort meddelandet permanent?", async () => {
        await deleteDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/messages`, id));
    });
}

export async function markMessageRead(globalState, id) {
    await updateDoc(doc(globalState.db, `artifacts/${globalState.appId}/public/data/messages`, id), { read: true });
}