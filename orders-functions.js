import { 
    getFirestore, onSnapshot, collection, query, orderBy, getDocs, updateDoc, doc, deleteDoc, where, writeBatch 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export function showMessage(message) {
    document.getElementById('modal-message').textContent = message;
    document.getElementById('messageModal').classList.add('active');
}

export function showConfirmation(globalState, message, onConfirm) {
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

export function startListeners(globalState) {
    const { db, appId, firebase } = globalState;
    const { onSnapshot, collection, query, orderBy } = firebase;
    
    const ordersRef = query(collection(db, `artifacts/${appId}/public/data/orders`), orderBy('timestamp', 'desc'));
    globalState.unsubscribeOrders = onSnapshot(ordersRef, (snapshot) => {
        globalState.ordersData = snapshot.docs.map(doc => ({ ...doc.data(), firestoreId: doc.id }));
        renderOrders(globalState);
        updateStatusBar(globalState);
    });

    const postcardsRef = collection(db, `artifacts/${appId}/public/data/postcards`);
    globalState.unsubscribePostcards = onSnapshot(postcardsRef, (snapshot) => {
        globalState.postcardsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderOrders(globalState);
    });
}

export function updateStatusBar(globalState) {
    const statusCounts = {
        'Ny': 0, 'Väntar': 0, 'Avakta Betalning': 0, 'Betald': 0, 'Skickad': 0, 'Klar': 0
    };
    globalState.ordersData.forEach(order => {
        const status = order.status || 'Ny';
        if (statusCounts[status] !== undefined) {
            statusCounts[status]++;
        } else {
            statusCounts['Ny']++;
        }
    });

    document.getElementById('status-Ny').textContent = `Ny: ${statusCounts['Ny']}`;
    document.getElementById('status-Väntar').textContent = `Väntar: ${statusCounts['Väntar']}`;
    document.getElementById('status-Avakta-Betalning').textContent = `Avvakta: ${statusCounts['Avakta Betalning']}`;
    document.getElementById('status-Betald').textContent = `Betald: ${statusCounts['Betald']}`;
    document.getElementById('status-Skickad').textContent = `Skickad: ${statusCounts['Skickad']}`;
    document.getElementById('status-Klar').textContent = `Klar: ${statusCounts['Klar']}`;
}

export async function renderOrders(globalState) {
    const ordersContainer = document.getElementById('orders-container');
    ordersContainer.innerHTML = '';
    
    const statusOrder = ['Ny', 'Väntar', 'Avakta Betalning', 'Betald', 'Skickad', 'Klar'];
    
    statusOrder.forEach(status => {
        const ordersInStatus = globalState.ordersData.filter(o => (o.status || 'Ny') === status);

        if (ordersInStatus.length > 0) {
            const sectionTitle = document.createElement('h2');
            sectionTitle.className = "text-3xl font-bold mt-8 mb-4";
            sectionTitle.textContent = status;
            ordersContainer.appendChild(sectionTitle);

            ordersInStatus.forEach(order => {
                const orderCard = document.createElement('div');
                
                let orderCardClass = "card";
                const hasObehandlad = order.items.some(item => (item.status || 'obehandlad') === 'obehandlad');
                const allKlar = order.items.every(item => (item.status || 'obehandlad') === 'klar');

                // Dynamiskt bestämma kantfärg baserat på orderns status
                if (order.status === 'Ny') {
                    orderCardClass += " order-card-ny";
                } else if (order.status === 'Klar') {
                    orderCardClass += " order-card-klar";
                } else {
                    orderCardClass += " order-card-obehandlad";
                }
                
                orderCard.className = orderCardClass;
                
                const timestamp = order.timestamp?.toDate ? order.timestamp.toDate().toLocaleString('sv-SE') : 'Okänt datum';
                const customerEmail = order.billingInfo?.email || 'Ingen e-post';
                const billingName = order.billingInfo?.name || 'Ej angivet';
                const billingMobile = order.billingInfo?.mobile || 'Ej angivet';

                let itemsHtml = order.items.map((item, itemIndex) => {
                    const postcard = globalState.postcardsData.find(p => p.id === item.id);
                    const thumbnailUrl = postcard ? postcard.imageURL : '';
                    const itemStatus = item.status || 'obehandlad';
                    const recipientInfo = item.recipient ? 
                        `${item.recipient.name || 'Ej angiven'}, ${item.recipient.address || 'Ej angiven'}, ${item.recipient.zip || ''} ${item.recipient.city || ''}` : 
                        'Ej angiven';
                    
                    const itemStatusClass = itemStatus === 'klar' ? 'item-status-klar' : 'item-status-obehandlad';
                    
                    return `
                        <li class="p-2 ${itemStatusClass} rounded-md flex items-center space-x-4 mb-2">
                            <img src="${thumbnailUrl}" alt="${item.title}" class="w-12 h-12 object-cover rounded-md">
                            <div class="flex-grow">
                                <p class="font-semibold">${item.title} (${item.size.charAt(0).toUpperCase() + item.size.slice(1)})</p>
                                <p class="text-sm">Mottagare: ${recipientInfo}</p>
                                <p class="text-sm">Status: ${itemStatus}</p>
                            </div>
                            <div>
                                <select onchange="window.updateItemStatus('${order.firestoreId}', ${itemIndex}, this.value)" class="p-1 rounded-md text-sm">
                                    <option value="obehandlad" ${itemStatus === 'obehandlad' ? 'selected' : ''}>Obehandlad</option>
                                    <option value="klar" ${itemStatus === 'klar' ? 'selected' : ''}>Klar</option>
                                </select>
                            </div>
                        </li>
                    `;
                }).join('');
                
                const orderIdToDisplay = order.orderNumber ? `#${order.orderNumber}` : `#${order.firestoreId.substring(0, 8)}`;


                orderCard.innerHTML = `
                    <div class="order-header flex justify-between items-center">
                        <div>
                            <h3 class="font-bold text-xl">Beställning ${orderIdToDisplay}</h3>
                            <p class="text-sm text-gray-600">${timestamp}</p>
                        </div>
                        <div class="flex items-center space-x-2">
                            <span class="status-header">${status}</span>
                            <button onclick="window.openOrderModal('${order.firestoreId}')" class="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600">Detaljer</button>
                        </div>
                    </div>
                    <div class="order-body">
                        <p class="text-sm"><strong>Kund:</strong> ${billingName}</p>
                        <p class="text-sm"><strong>E-post:</strong> ${customerEmail}</p>
                        <p class="text-sm"><strong>Mobil:</strong> ${billingMobile}</p>
                        <p class="text-sm"><strong>Total:</strong> ${order.total.toFixed(2)} kr</p>
                        <h4 class="font-bold text-lg mt-4">Vykort i ordern:</h4>
                        <ul class="order-item-list mt-2">
                            ${itemsHtml}
                        </ul>
                    </div>
                `;
                ordersContainer.appendChild(orderCard);
            });
        }
    });
}

export function openOrderModal(globalState, orderId) {
    const order = globalState.ordersData.find(o => o.firestoreId === orderId);
    if (!order) {
        window.showMessage('Fel: Ordern hittades inte.');
        return;
    }

    // Spara order-ID och orderobjekt i global state för att kunna referera till det i modalen
    globalState.currentOrder = order;

    const modalTitle = document.getElementById('modal-order-title');
    const modalId = document.getElementById('modal-order-id');
    const modalEmail = document.getElementById('modal-order-email');
    const modalDate = document.getElementById('modal-order-date');
    const modalStatus = document.getElementById('modal-order-status');
    const modalItemsList = document.getElementById('modal-order-items');
    const modalTotal = document.getElementById('modal-order-total');
    const modalBillingAddress = document.getElementById('modal-billing-address');
    const modalBillingMobile = document.getElementById('modal-billing-mobile');

    const orderIdToDisplay = order.orderNumber ? `#${order.orderNumber}` : `#${order.firestoreId.substring(0, 8)}`;
    modalTitle.textContent = `Beställningsdetaljer (${orderIdToDisplay})`;

    modalId.textContent = order.orderNumber || order.firestoreId;
    modalEmail.textContent = order.billingInfo?.email || 'Ingen e-post';
    modalDate.textContent = order.timestamp?.toDate ? order.timestamp.toDate().toLocaleString('sv-SE') : 'Okänt datum';
    modalStatus.textContent = order.status || 'Ny';
    modalTotal.textContent = `${order.total.toFixed(2)} kr`;
    modalBillingAddress.textContent = order.billingInfo?.address ? 
        `${order.billingInfo.address}, ${order.billingInfo.zip} ${order.billingInfo.city}` : 
        'Ej angiven';
    modalBillingMobile.textContent = order.billingInfo?.mobile || 'Ej angivet';


    modalItemsList.innerHTML = order.items.map(item => {
        const postcard = globalState.postcardsData.find(p => p.id === item.id);
        const thumbnailUrl = postcard ? postcard.imageURL : '';
        const recipientInfo = item.recipient ? 
            `${item.recipient.name}, ${item.recipient.address}, ${item.recipient.zip} ${item.recipient.city}` : 
            'Ej angiven';
        const itemStatus = item.status || 'obehandlad';
        const itemStatusClass = itemStatus === 'klar' ? 'item-status-klar' : 'item-status-obehandlad';

        return `
            <li class="p-2 ${itemStatusClass} rounded-md">
                <div class="flex items-center">
                    <img src="${thumbnailUrl}" alt="${item.title}" class="w-12 h-12 rounded-md mr-4">
                    <div>
                        <p class="font-bold">${item.title} (${item.size.charAt(0).toUpperCase() + item.size.slice(1)})</p>
                        <p class="text-sm">Pris: ${item.price.toFixed(2)} kr</p>
                        <p class="text-sm">Text: ${item.message || 'Ingen text'}</p>
                        <p class="text-sm">Mottagare: ${recipientInfo}</p>
                        <p class="text-sm font-semibold">Status: ${itemStatus}</p>
                    </div>
                </div>
            </li>
        `;
    }).join('');
    
    document.getElementById('orderModal').classList.add('active');
}

export async function updateOrderStatus(globalState, orderId, newStatus) {
    const { db, appId, firebase } = globalState;
    const { doc, updateDoc } = firebase;
    const orderRef = doc(db, `artifacts/${appId}/public/data/orders`, orderId);

    const orderToUpdate = globalState.ordersData.find(o => o.firestoreId === orderId);
    if (!orderToUpdate) {
        window.showMessage('Fel: Ordern hittades inte.');
        return;
    }

    if (newStatus === 'Klar') {
        window.showConfirmation("Är du säker på att du vill markera ordern som 'Klar'? Detta kommer att ta bort alla adresser permanent.", async () => {
            const sanitizedItems = orderToUpdate.items.map(item => ({
                id: item.id || null,
                title: item.title || null,
                size: item.size || null,
                price: item.price || null,
                group: item.group || null,
                message: item.message || null,
                status: item.status || 'obehandlad',
                recipient: null
            }));
            
            const sanitizedBillingInfo = {
                name: orderToUpdate.billingInfo?.name || null,
                email: orderToUpdate.billingInfo?.email || null,
                mobile: orderToUpdate.billingInfo?.mobile || null,
                address: null,
                zip: null,
                city: null
            };

            await updateDoc(orderRef, { 
                status: newStatus,
                items: sanitizedItems,
                billingInfo: sanitizedBillingInfo
            });
            window.showMessage(`Order #${orderId.substring(0, 8)} är nu markerad som 'Klar' och adresser har raderats.`);
            document.getElementById('orderModal').classList.remove('active');
        });
    } else {
        await updateDoc(orderRef, { status: newStatus });
        window.showMessage(`Order #${orderId.substring(0, 8)} uppdaterad till ${newStatus}.`);
        document.getElementById('orderModal').classList.remove('active');
    }
}

export async function updateItemStatus(globalState, orderId, itemIndex, newStatus) {
    const { db, appId, showMessage } = globalState;
    const order = globalState.ordersData.find(o => o.firestoreId === orderId);
    if (!order) {
        window.showMessage('Fel: Ordern hittades inte.');
        return;
    }
    
    const orderRef = doc(db, `artifacts/${appId}/public/data/orders`, orderId);
    
    order.items[itemIndex].status = newStatus;

    await updateDoc(orderRef, { items: order.items });
    window.showMessage(`Vykort i order #${orderId.substring(0, 8)} uppdaterad.`);
}

export async function deleteOrder(globalState, orderId) {
    const { db, appId, firebase } = globalState;
    const { doc, deleteDoc } = firebase;

    const orderToUpdate = globalState.ordersData.find(o => o.firestoreId === orderId);
    if (!orderToUpdate) {
        window.showMessage('Fel: Ordern hittades inte.');
        return;
    }

    window.showConfirmation("Är du säker på att du vill ta bort denna order permanent?", async () => {
        const orderRef = doc(db, `artifacts/${appId}/public/data/orders`, orderId);
        await deleteDoc(orderRef);
        window.showMessage(`Order #${orderId.substring(0, 8)} borttagen.`);
        document.getElementById('orderModal').classList.remove('active');
    });
}


export async function deleteAllOldOrders(globalState) {
    const { db, appId, firebase } = globalState;
    const { collection, getDocs, writeBatch } = firebase;
    const ordersRef = collection(db, `artifacts/${appId}/public/data/orders`);
    
    window.showConfirmation("Är du säker på att du vill radera ALLA ordrar som har ett femsiffrigt ID? Denna åtgärd kan inte ångras.", async () => {
        try {
            const ordersToDelete = globalState.ordersData.filter(order => /^\d{5}$/.test(order.orderNumber));
            
            if (ordersToDelete.length === 0) {
                window.showMessage('Inga gamla testordrar med femsiffrigt ID hittades.');
                return;
            }
            
            const batch = writeBatch(db);
            ordersToDelete.forEach(order => {
                batch.delete(doc(ordersRef, order.firestoreId));
            });
            
            await batch.commit();
            window.showMessage(`Tog bort ${ordersToDelete.length} gamla testordrar.`);
        } catch (e) {
            console.error("Fel vid radering av gamla ordrar:", e);
            window.showMessage('Ett fel uppstod vid radering av ordrar. Se konsolen för detaljer.');
        }
    });
}