package com.kestrel.ledger.data

import com.google.firebase.Timestamp
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import java.util.UUID

data class AndroidWallet(
    val availableCoins: Long = 0,
    val pendingCoins: Long = 0,
    val totalPurchasedCoins: Long = 0,
    val simulatedCommissionBalance: Long = 0
)

data class AndroidProduct(
    val productId: String = "",
    val title: String = "",
    val description: String = "",
    val category: String = "",
    val itemType: String = "product",
    val coinPrice: Long = 0,
    val inrPrice: Long = 0,
    val active: Boolean = true,
    val billingCycle: String = "one_time",
    val terms: String = ""
)

data class AndroidSupportTicket(
    val ticketId: String = "",
    val category: String = "",
    val subject: String = "",
    val description: String = "",
    val status: String = "open"
)

class FirebaseRepository(
    private val auth: FirebaseAuth,
    private val db: FirebaseFirestore,
    private val analytics: FirebaseAnalytics
) {
    fun currentUid(): String? = auth.currentUser?.uid

    fun observeWallet(uid: String): Flow<AndroidWallet> = callbackFlow {
        val reg = db.collection("wallets").document(uid)
            .addSnapshotListener { snap, err ->
                if (err != null) {
                    close(err)
                    return@addSnapshotListener
                }
                if (snap != null && snap.exists()) {
                    trySend(
                        AndroidWallet(
                            availableCoins = snap.getLong("availableCoins") ?: 0L,
                            pendingCoins = snap.getLong("pendingCoins") ?: 0L,
                            totalPurchasedCoins = snap.getLong("totalPurchasedCoins") ?: 0L,
                            simulatedCommissionBalance = snap.getLong("simulatedCommissionBalance") ?: 0L
                        )
                    )
                }
            }
        awaitClose { reg.remove() }
    }

    fun observeActiveProducts(): Flow<List<AndroidProduct>> = callbackFlow {
        val reg = db.collection("products")
            .whereEqualTo("active", true)
            .addSnapshotListener { snap, err ->
                if (err != null) {
                    close(err)
                    return@addSnapshotListener
                }
                val items = snap?.documents?.map { doc ->
                    AndroidProduct(
                        productId = doc.getString("productId") ?: doc.id,
                        title = doc.getString("title") ?: "",
                        description = doc.getString("description") ?: "",
                        category = doc.getString("category") ?: "",
                        itemType = doc.getString("itemType") ?: "product",
                        coinPrice = doc.getLong("coinPrice") ?: 0L,
                        inrPrice = doc.getLong("inrPrice") ?: 0L,
                        active = doc.getBoolean("active") ?: true,
                        billingCycle = doc.getString("billingCycle") ?: "one_time",
                        terms = doc.getString("terms") ?: ""
                    )
                } ?: emptyList()
                trySend(items)
            }
        awaitClose { reg.remove() }
    }

    fun observeSupportTickets(uid: String): Flow<List<AndroidSupportTicket>> = callbackFlow {
        val reg = db.collection("support_tickets")
            .whereEqualTo("userId", uid)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .addSnapshotListener { snap, err ->
                if (err != null) {
                    close(err)
                    return@addSnapshotListener
                }
                val list = snap?.documents?.map { doc ->
                    AndroidSupportTicket(
                        ticketId = doc.getString("ticketId") ?: doc.id,
                        category = doc.getString("category") ?: "Other",
                        subject = doc.getString("subject") ?: "",
                        description = doc.getString("description") ?: "",
                        status = doc.getString("status") ?: "open"
                    )
                } ?: emptyList()
                trySend(list)
            }
        awaitClose { reg.remove() }
    }

    suspend fun submitSupportTicket(category: String, subject: String, description: String) {
        val user = auth.currentUser ?: error("Not signed in")
        val ticketId = "tkt_${UUID.randomUUID().toString().replace("-", "").take(14)}"
        val now = Timestamp.now()
        val data = hashMapOf(
            "ticketId" to ticketId,
            "userId" to user.uid,
            "userEmail" to (user.email ?: ""),
            "category" to category,
            "subject" to subject,
            "description" to description,
            "attachmentName" to "",
            "attachmentDataUrl" to "",
            "status" to "open",
            "priority" to "normal",
            "createdAt" to now,
            "updatedAt" to now
        )
        db.collection("support_tickets").document(ticketId).set(data).await()
        analytics.logEvent("support_ticket_created", null)
    }
}
